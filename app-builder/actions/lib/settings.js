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

// The wrap-up skill: instructions (SKILL.md-style text) sent to Claude as the system prompt when a
// user finishes the assessment. One document in app_settings, key 'skill'.
const SKILL_KEY = 'skill'

// The wrap-up template: HTML with {{fields}} that Claude's JSON reply is filled into (see lib/template.js).
// One document in app_settings, key 'template'. Without one, the wrap-up output is Claude's reply as it is.
const TEMPLATE_KEY = 'template'

/** Checks a template update: { text }. */
function validateTemplate (input) {
  const errors = {}
  const text = input && typeof input.text === 'string' ? input.text.replace(/\r\n/g, '\n') : ''
  try { require('./template').check(text) } catch (e) { errors.text = e.message }
  return { text, errors }
}

/** The template as the browser may see it; null when none is saved. */
const publicTemplate = (d) => (d && d.text ? { text: d.text, updatedAt: d.updatedAt || null, updatedBy: d.updatedBy || '' } : null)

const SKILL_MAX_FILES = 40
const SKILL_MAX_FILE_CHARS = 100000
const SKILL_MAX_TOTAL_CHARS = 400000

/** A resource path from a zip: relative, forward slashes, no '..'; '' when unusable. */
function cleanSkillPath (p) {
  const path = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!path || path.length > 200 || path.split('/').some((seg) => seg === '..' || seg === '')) return ''
  return path
}

/** Checks a skill update: { name, text, files: [{ path, text }] } (files = extra resources from a zip). */
function validateSkill (input) {
  const errors = {}
  const s = input && typeof input === 'object' ? input : {}
  const name = str(s.name)
  if (!name) errors.name = 'required'
  else if (name.length > 120) errors.name = 'at most 120 characters'
  const text = typeof s.text === 'string' ? s.text.replace(/\r\n/g, '\n').trim() : ''
  if (!text) errors.text = 'required'
  else if (text.length > 50000) errors.text = 'at most 50,000 characters'

  const files = []
  const seen = new Set()
  const list = Array.isArray(s.files) ? s.files : []
  if (list.length > SKILL_MAX_FILES) errors.files = `at most ${SKILL_MAX_FILES} resource files`
  let total = text.length
  for (const f of list.slice(0, SKILL_MAX_FILES)) {
    const path = cleanSkillPath(f && f.path)
    const body = f && typeof f.text === 'string' ? f.text.replace(/\r\n/g, '\n') : ''
    if (!path || !body.trim() || seen.has(path)) { errors.files = errors.files || `unusable or duplicate resource file: ${String((f && f.path) || '').slice(0, 80)}`; continue }
    if (body.length > SKILL_MAX_FILE_CHARS) { errors.files = `${path} is over ${SKILL_MAX_FILE_CHARS.toLocaleString('en-US')} characters`; continue }
    total += body.length
    seen.add(path)
    files.push({ path, text: body })
  }
  if (total > SKILL_MAX_TOTAL_CHARS && !errors.files) errors.files = `the skill and its resources are over ${SKILL_MAX_TOTAL_CHARS.toLocaleString('en-US')} characters in total`
  return { name, text, files, errors }
}

/** The skill as the browser may see it; null when none is saved. */
const publicSkill = (d) => (d && d.text
  ? { name: d.name || '', text: d.text, files: d.files || [], updatedAt: d.updatedAt || null, updatedBy: d.updatedBy || '' }
  : null)

/** The system prompt sent to Claude: the instructions, then every resource file with its path. */
function skillSystemText (skill) {
  const files = (skill && skill.files) || []
  if (!files.length) return skill.text
  const parts = files.map((f) => `<resource path="${f.path}">\n${f.text}\n</resource>`)
  return `${skill.text}\n\nThe skill's resource files follow. Refer to them by path when the instructions mention them.\n\n<resources>\n${parts.join('\n\n')}\n</resources>`
}

module.exports = {
  SKILL_KEY,
  validateSkill,
  publicSkill,
  skillSystemText,
  TEMPLATE_KEY,
  validateTemplate,
  publicTemplate,
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
