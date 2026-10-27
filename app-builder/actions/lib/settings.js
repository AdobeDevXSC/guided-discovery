// Prompts edited on the viewer's Settings page (collection ai_prompts), for sending results to AI.
// Only the admin action (Adobe IMS sign-in) reads or writes them. The AI service's API key is not
// stored here: it is a server-side secret set at deploy time, never in the database or the browser.

const PROMPTS_COLLECTION = 'ai_prompts'
const PROMPT_INDEXES = [{ spec: { promptId: 1 }, options: { unique: true } }, { spec: { updatedAt: -1 }, options: {} }]

const str = (v) => (typeof v === 'string' ? v.trim() : '')

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
  PROMPTS_COLLECTION,
  PROMPT_INDEXES,
  PROMPT_ID_RE,
  validatePrompt,
  publicPrompt
}
