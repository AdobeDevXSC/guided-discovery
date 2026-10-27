// Sending a completed assessment to AI (Anthropic's Claude), server to server.
//
// The admin action builds the input (every question's full text with the answer labels, plus the
// scored result) and stores it on an analysis record in ai_analyses; the ai-analysis action then
// sends it with the chosen prompt and stores Claude's reply on the same record. Contact details
// (name, email, phone) are never part of the input.
const questions = require('./questions')
const SCORING = require('./scoring-config.json')

const ANALYSES_COLLECTION = 'ai_analyses'
const ANALYSES_INDEXES = [
  { spec: { analysisId: 1 }, options: { unique: true } },
  { spec: { responseId: 1, createdAt: -1 }, options: {} }
]
const STATUSES = ['queued', 'running', 'done', 'failed']
const MODEL = 'claude-opus-5-5'
const MAX_TOKENS = 64000
// A queued or running analysis older than this is reported as failed (the action timed out or died).
const STALE_MS = 15 * 60 * 1000

const ASSESSMENT_LABELS = { 'self-guided': 'Adobe Analytics to Customer Journey Analytics self-guided assessment' }
const words = (id) => String(id || '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
const labelOf = (list, id) => ((list || []).find((x) => x.id === id) || {}).label || words(id)

/** The scored result as text lines, with labels from the scoring rules. */
function resultLines (assessment, result) {
  if (!result) return ['Not scored.']
  const rules = SCORING[assessment] || {}
  const lines = []
  if (typeof result.readinessPct === 'number') lines.push(`Readiness: ${Math.round(result.readinessPct * 100)}%`)
  if (result.headline) lines.push(`Readiness band: ${labelOf(rules.headlines, result.headline)}`)
  if (result.engagement) {
    const size = (rules.sizes || []).find((x) => x.id === result.engagement)
    lines.push(`Recommended engagement: ${size ? `${size.label} (${size.title}, ${size.duration})` : words(result.engagement)}`)
  }
  const caps = result.matchedCapabilities || []
  lines.push(`Matched capabilities (${caps.length}):`)
  for (const c of caps) {
    const cap = (rules.capabilities || []).find((x) => x.id === c.id)
    lines.push(`- ${cap ? `${cap.label}: ${cap.description}` : words(c.id)}`)
  }
  return lines
}

/**
 * The assessment as plain text for the model: every section and question in page order with its
 * full text and the answer labels ("Not answered" when empty), then the scored result.
 */
function buildInput ({ assessment, response, sections }) {
  const sheet = questions.answerSheet(sections, response.sections)
  const out = [
    `Assessment: ${ASSESSMENT_LABELS[assessment] || assessment}`,
    `Status: ${response.status}${response.completedAt ? `, completed ${response.completedAt}` : ''}`,
    ''
  ]
  for (const s of sheet) {
    if (s.unknown) continue // answers to questions no longer in the bank
    out.push(`## ${s.title}`, '')
    for (const q of s.questions) {
      out.push(`Question: ${q.text || q.question}`)
      if (!q.values.length) out.push('Answer: Not answered')
      else if (q.values.length === 1) out.push(`Answer: ${questions.valueText(q.values[0])}`)
      else out.push('Answer:', ...q.values.map((v) => `- ${questions.valueText(v)}`))
      out.push('')
    }
  }
  out.push('## Result', '', ...resultLines(assessment, response.result))
  return out.join('\n')
}

/** The message sent to Claude: the assessment first, then the stored prompt's instructions. */
function userMessage (input, promptText) {
  return `<assessment>\n${input}\n</assessment>\n\n${promptText}`
}

/** Calls Claude and returns { text, model, stopReason, usage }; throws the SDK's typed errors. */
async function analyze ({ apiKey, input, promptText }) {
  const Anthropic = require('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey, maxRetries: 2 })
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // a classifier decline is retried on Anthropic's recommended fallback model, server side
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: userMessage(input, promptText) }]
  })
  const message = await stream.finalMessage()
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim()
  return {
    text,
    model: message.model,
    stopReason: message.stop_reason,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens }
  }
}

/** A failure as a short message that is safe to store and show (never includes the key). */
function failureText (e) {
  const Anthropic = require('@anthropic-ai/sdk')
  if (e instanceof Anthropic.AuthenticationError) return 'The API key was rejected by Anthropic. Replace it on the Settings page.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'The API key is not allowed to use this model.'
  if (e instanceof Anthropic.RateLimitError) return 'Anthropic rate limit reached. Try again in a minute.'
  if (e instanceof Anthropic.BadRequestError) return `Anthropic rejected the request: ${String(e.message).slice(0, 300)}`
  if (e instanceof Anthropic.APIError && e.status) return `Anthropic error ${e.status}. Try again later.`
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach Anthropic. Try again later.'
  return 'The analysis failed.'
}

/** An analysis as the viewer sees it; a stuck queued/running record is reported as failed. */
function publicAnalysis (d, now = Date.now()) {
  const stale = (d.status === 'queued' || d.status === 'running') && now - Date.parse(d.createdAt) > STALE_MS
  return {
    analysisId: d.analysisId,
    responseId: d.responseId,
    status: stale ? 'failed' : d.status,
    error: stale ? 'The analysis did not finish. Try again.' : (d.error || ''),
    promptId: d.promptId,
    promptName: d.promptName,
    model: d.model || MODEL,
    output: d.output || '',
    stopReason: d.stopReason || '',
    usage: d.usage || null,
    input: d.input,
    createdAt: d.createdAt,
    createdBy: d.createdBy || '',
    finishedAt: d.finishedAt || null
  }
}

module.exports = {
  ANALYSES_COLLECTION,
  ANALYSES_INDEXES,
  STATUSES,
  MODEL,
  buildInput,
  userMessage,
  analyze,
  failureText,
  publicAnalysis
}
