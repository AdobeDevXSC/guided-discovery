// App settings edited on the viewer's Settings page (collection app_settings) and stored prompts
// (collection ai_prompts). Only the admin action (Adobe IMS sign-in) reads or writes them.
//
// The AI client secret is encrypted with AES-256-GCM before it is stored, using the 32-byte key in
// the action input `settingsKey` (SETTINGS_ENCRYPTION_KEY in .env). It is never returned: callers
// see whether one is saved and its last four characters. Losing the key means re-entering it.
const crypto = require('crypto')

const SETTINGS_COLLECTION = 'app_settings'
const PROMPTS_COLLECTION = 'ai_prompts'
const SETTINGS_INDEXES = [{ spec: { key: 1 }, options: { unique: true } }]
const PROMPT_INDEXES = [{ spec: { promptId: 1 }, options: { unique: true } }, { spec: { updatedAt: -1 }, options: {} }]
const AI_KEY = 'ai'

const str = (v) => (typeof v === 'string' ? v.trim() : '')

function keyOf (settingsKey) {
  const key = Buffer.from(String(settingsKey || ''), 'base64')
  if (key.length !== 32) throw Object.assign(Error('settings encryption key is missing or not 32 bytes'), { code: 'NO_KEY' })
  return key
}

function encrypt (plain, settingsKey) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyOf(settingsKey), iv)
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  return { alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }
}

/** For server-side use only (e.g. calling the AI service). Never send the result to a browser. */
function decrypt (box, settingsKey) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyOf(settingsKey), Buffer.from(box.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(box.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]).toString('utf8')
}

/** The AI settings as the browser may see them. */
function publicAi (doc) {
  const d = doc || {}
  return {
    clientId: d.clientId || '',
    hasSecret: Boolean(d.secret),
    secretHint: d.secretHint || '',
    updatedAt: d.updatedAt || null,
    updatedBy: d.updatedBy || ''
  }
}

/**
 * Checks an AI settings update. clientSecret: a new value replaces the saved one; omitted or empty
 * keeps it; clearSecret: true removes it. Returns { set, unset, errors }.
 */
function validateAi (input, settingsKey) {
  const errors = {}
  const ai = input && typeof input === 'object' ? input : {}
  const clientId = str(ai.clientId)
  if (clientId.length > 200) errors.clientId = 'at most 200 characters'
  else if (/\s/.test(clientId)) errors.clientId = 'no spaces'
  const secret = typeof ai.clientSecret === 'string' ? ai.clientSecret.trim() : ''
  if (secret.length > 1000) errors.clientSecret = 'at most 1000 characters'
  const set = { clientId }
  const unset = {}
  if (!Object.keys(errors).length && secret) {
    try {
      set.secret = encrypt(secret, settingsKey)
      set.secretHint = secret.slice(-4)
    } catch (e) {
      if (e.code === 'NO_KEY') errors.clientSecret = 'the server has no encryption key configured; the secret was not saved'
      else throw e
    }
  } else if (ai.clearSecret === true) {
    unset.secret = ''
    unset.secretHint = ''
  }
  return { set, unset, errors }
}

const PROMPT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Checks a prompt create/update: { promptId?, name, text }. */
function validatePrompt (input) {
  const errors = {}
  const p = input && typeof input === 'object' ? input : {}
  const promptId = str(p.promptId)
  if (promptId && !PROMPT_ID_RE.test(promptId)) errors.promptId = 'invalid prompt id'
  const name = str(p.name)
  if (!name) errors.name = 'required'
  else if (name.length > 120) errors.name = 'at most 120 characters'
  const text = typeof p.text === 'string' ? p.text.replace(/\r\n/g, '\n').trim() : ''
  if (!text) errors.text = 'required'
  else if (text.length > 20000) errors.text = 'at most 20,000 characters'
  return { promptId, name, text, errors }
}

const publicPrompt = (d) => ({
  promptId: d.promptId, name: d.name, text: d.text, createdAt: d.createdAt, updatedAt: d.updatedAt, updatedBy: d.updatedBy || ''
})

module.exports = {
  SETTINGS_COLLECTION,
  PROMPTS_COLLECTION,
  SETTINGS_INDEXES,
  PROMPT_INDEXES,
  AI_KEY,
  PROMPT_ID_RE,
  encrypt,
  decrypt,
  publicAi,
  validateAi,
  validatePrompt,
  publicPrompt
}
