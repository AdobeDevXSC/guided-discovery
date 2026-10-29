// Settings edited on the viewer's Settings page: the AI service's API key (collection app_settings)
// and stored prompts (collection ai_prompts). Only the admin action (Adobe IMS sign-in) writes them.
//
// The Amazon Bedrock API key (long-term, ABSK…) is entered on the page and stored on the server,
// encrypted with RSA-OAEP (SHA-256). The admin action holds only the public key (input `aiKeyPublic`,
// AI_KEY_PUBLIC in .env), so it can encrypt a new key but never read a saved one. Only the action that calls Claude gets the
// private key (AI_KEY_PRIVATE) and decrypts it, server to server. The browser sees whether a key is
// saved and its last four characters, never the key.
const crypto = require('crypto')

const SETTINGS_COLLECTION = 'app_settings'
const PROMPTS_COLLECTION = 'ai_prompts'
const SETTINGS_INDEXES = [{ spec: { key: 1 }, options: { unique: true } }]
const PROMPT_INDEXES = [{ spec: { promptId: 1 }, options: { unique: true } }, { spec: { updatedAt: -1 }, options: {} }]
const AI_KEY = 'ai'
const ALG = 'rsa-oaep-256'
const PROVIDER = 'bedrock'
// a long-term Bedrock API key: ABSK followed by base64
const KEY_RE = /^ABSK[A-Za-z0-9+/]+={0,2}$/

const str = (v) => (typeof v === 'string' ? v.trim() : '')

// Keys are base64 DER on one line (SPKI public, PKCS#8 private), so they fit in .env.
const publicKeyOf = (b64) => crypto.createPublicKey({ key: Buffer.from(String(b64 || ''), 'base64'), format: 'der', type: 'spki' })
const privateKeyOf = (b64) => crypto.createPrivateKey({ key: Buffer.from(String(b64 || ''), 'base64'), format: 'der', type: 'pkcs8' })
const OAEP = { padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }

function encrypt (plain, publicKeyB64) {
  let key
  try { key = publicKeyOf(publicKeyB64) } catch (e) { throw Object.assign(Error('no public key'), { code: 'NO_KEY' }) }
  return { alg: ALG, data: crypto.publicEncrypt({ key, ...OAEP }, Buffer.from(String(plain), 'utf8')).toString('base64') }
}

/** For the action that calls the AI service only. Never send the result to a browser. */
function decrypt (box, privateKeyB64) {
  if (!box || box.alg !== ALG) throw Error('unsupported key format')
  return crypto.privateDecrypt({ key: privateKeyOf(privateKeyB64), ...OAEP }, Buffer.from(box.data, 'base64')).toString('utf8')
}

/** True when a Bedrock key is saved (a key saved for an earlier provider doesn't count). */
const hasKey = (doc) => Boolean(doc && doc.apiKey && doc.provider === PROVIDER)

/** The AI settings as the browser may see them. */
function publicAi (doc) {
  const d = doc || {}
  return {
    provider: PROVIDER,
    hasKey: hasKey(d),
    keyHint: hasKey(d) ? d.apiKeyHint || '' : '',
    updatedAt: d.updatedAt || null,
    updatedBy: d.updatedBy || ''
  }
}

/** Checks an API key update: { apiKey } replaces the saved key, { clearKey: true } removes it. */
function validateAi (input, publicKeyB64) {
  const ai = input && typeof input === 'object' ? input : {}
  if (ai.clearKey === true) return { set: {}, unset: { apiKey: '', apiKeyHint: '', provider: '' }, errors: {} }
  const apiKey = typeof ai.apiKey === 'string' ? ai.apiKey.trim() : ''
  const errors = {}
  if (!apiKey) errors.apiKey = 'required'
  else if (!KEY_RE.test(apiKey)) errors.apiKey = 'a long-term Amazon Bedrock API key starts with ABSK'
  // RSA-OAEP with a 3072-bit key fits 318 bytes; short-term Bedrock keys are much longer
  else if (Buffer.byteLength(apiKey) > 300) errors.apiKey = 'too long; use a long-term Bedrock API key'
  if (Object.keys(errors).length) return { set: {}, unset: {}, errors }
  try {
    return { set: { provider: PROVIDER, apiKey: encrypt(apiKey, publicKeyB64), apiKeyHint: apiKey.slice(-4) }, unset: {}, errors }
  } catch (e) {
    if (e.code === 'NO_KEY') return { set: {}, unset: {}, errors: { apiKey: 'the server has no encryption key configured; the key was not saved' } }
    throw e
  }
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
  encrypt,
  decrypt,
  hasKey,
  publicAi,
  validateAi,
  PROMPT_ID_RE,
  validatePrompt,
  publicPrompt
}
