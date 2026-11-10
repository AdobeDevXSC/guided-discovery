// Sending a completed assessment to AI (Claude on Amazon Bedrock, bedrock-runtime in us-east-2),
// server to server, authenticated with the saved Bedrock API key.
//
// The admin action builds the input (every question's full text and help text with the answer labels, plus the
// scored result) and stores it on an analysis record in ai_analyses; the ai-analysis action then
// sends it with the chosen prompt and stores Claude's reply on the same record. Contact details
// (name, email, phone) are never part of the input.
const questions = require('./questions')
const SCORING = require('./scoring-rules')

const ANALYSES_COLLECTION = 'ai_analyses'
const ANALYSES_INDEXES = [
  { spec: { analysisId: 1 }, options: { unique: true } },
  { spec: { responseId: 1, createdAt: -1 }, options: {} },
  { spec: { createdAt: -1 }, options: {} }
]
// What started an analysis: an admin from the viewer, or a user finishing the assessment.
const TRIGGERS = ['manual', 'wrapup']
// Prompt sent with the assessment when the wrap-up skill is the system prompt.
const WRAPUP_PROMPT = 'Using the skill instructions, write the personalized Analytics Modernization Guide for this assessment.'

/** Profile details worth sending (company, role, etc.); contact details are never included. */
function profileLines (profile) {
  const skip = /name|e-?mail|phone|mobile|tel|address|linkedin/i
  const lines = []
  for (const [k, v] of Object.entries(profile || {})) {
    if (skip.test(k) || v === null || v === undefined || typeof v === 'object' || v === '') continue
    lines.push(`${words(k.replace(/([A-Z])/g, ' $1').toLowerCase())}: ${String(v).slice(0, 200)}`)
  }
  return lines
}
/**
 * Facts for the wrap-up template, straight from the scoring rules and the profile (Claude is not asked for
 * these): company, date, readiness %, band, recommended engagement and matched capabilities.
 */
function computedFacts ({ assessment, response, profile }) {
  const rules = SCORING[assessment] || {}
  const r = response.result || {}
  const size = (rules.sizes || []).find((x) => x.id === r.engagement)
  const caps = (r.matchedCapabilities || []).map((c) => {
    const cap = (rules.capabilities || []).find((x) => x.id === c.id)
    return { label: cap ? cap.label : words(c.id), description: cap ? cap.description : '' }
  })
  const p = profile || {}
  const when = new Date(response.completedAt || Date.now())
  return {
    company: String(p.organization || p.company || p.companyName || '').slice(0, 200),
    date: when.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
    readinessPct: typeof r.readinessPct === 'number' ? Math.round(r.readinessPct * 100) : null,
    band: r.headline ? labelOf(rules.headlines, r.headline) : '',
    engagement: size ? { label: size.label, title: size.title, duration: size.duration } : (r.engagement ? { label: words(r.engagement), title: '', duration: '' } : null),
    capabilities: caps,
    capabilityCount: caps.length
  }
}

/** A reply that is one HTML document inside a ```html fence (and maybe notes after it) as just the document. */
function unfenceHtml (text) {
  const m = String(text || '').match(/^\s*```(?:html)?[ \t]*\n([\s\S]*?)\n```/i)
  return m && /^\s*(<!doctype html|<html[\s>])/i.test(m[1]) ? m[1].trim() : text
}

const STATUSES = ['queued', 'running', 'done', 'failed']
const MODEL = 'us.anthropic.claude-sonnet-5-5' // Bedrock inference profile (cross-region, us)
const REGION = 'us-east-2' // https://bedrock-runtime.us-east-2.amazonaws.com
const MAX_TOKENS = 64000
// A queued or running analysis older than this is reported as failed (the action timed out or died).
const STALE_MS = 15 * 60 * 1000

const ASSESSMENT_LABELS = {
  'self-guided': 'Adobe Analytics to Customer Journey Analytics self-guided assessment',
  'facilitator-led': 'Adobe Analytics to Customer Journey Analytics facilitator-led assessment'
}
const VIEW_LABELS = { executive: 'executive session', practitioner: 'practitioner session' }
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
 * full text, its help text when it has one, and the answer labels ("Not answered" when empty), then the scored result.
 */
function buildInput ({ assessment, response, sections }) {
  const sheet = questions.answerSheet(sections, response.sections)
  const out = [
    `Assessment: ${ASSESSMENT_LABELS[assessment] || assessment}${response.view ? ` (${VIEW_LABELS[response.view] || response.view})` : ''}`,
    `Status: ${response.status}${response.completedAt ? `, completed ${response.completedAt}` : ''}`,
    ''
  ]
  for (const s of sheet) {
    if (s.unknown) continue // answers to questions no longer in the bank
    out.push(`## ${s.title}`, '')
    for (const q of s.questions) {
      out.push(`Question: ${q.text || q.question}`)
      if (q.help) out.push(`Help text: ${q.help}`)
      if (!q.values.length) out.push('Answer: Not answered')
      else if (q.values.length === 1) out.push(`Answer: ${questions.valueText(q.values[0])}`)
      else out.push('Answer:', ...q.values.map((v) => `- ${questions.valueText(v)}`))
      if (q.notSelected && q.notSelected.length) out.push('Not selected:', ...q.notSelected.map((o) => `- ${o.label}`))
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
async function analyze ({ apiKey, input, promptText, systemText }) {
  const { AnthropicBedrock } = require('@anthropic-ai/bedrock-sdk')
  const client = new AnthropicBedrock({ apiKey, awsRegion: REGION, maxRetries: 2 })
  // Bedrock has no server-side fallback, so a classifier decline comes back as stop_reason 'refusal'
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    ...(systemText ? { system: systemText } : {}),
    messages: [{ role: 'user', content: userMessage(input, promptText) }]
  })
  const message = await stream.finalMessage()
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim()
  return {
    text,
    model: message.model || MODEL,
    stopReason: message.stop_reason,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens }
  }
}

// Bedrock's own error text, e.g. { Message: "..." }, kept short
const bedrockMessage = (e) => String((e.error && (e.error.Message || e.error.message)) || '').slice(0, 200)

/** A failure as a short message that is safe to store and show (never includes the key). */
function failureText (e) {
  const Anthropic = require('@anthropic-ai/sdk')
  // the Bedrock client throws the base SDK's error classes
  if (e instanceof Anthropic.AuthenticationError) return 'The API key was rejected by Amazon Bedrock. Replace it on the Settings page.'
  // Bedrock answers 403 both for a bad key and for missing model access; tell them apart by its message
  if (e instanceof Anthropic.PermissionDeniedError) {
    const said = bedrockMessage(e)
    if (/api key|security token|authenticat|expired|signature/i.test(said)) return `The API key was rejected by Amazon Bedrock (${said}). Replace it on the Settings page.`
    return `The API key is not allowed to use ${MODEL} in ${REGION}${said ? ` (${said})` : ''}. Check the key's permissions and model access in the AWS console.`
  }
  if (e instanceof Anthropic.RateLimitError) return 'Amazon Bedrock rate limit reached. Try again in a minute.'
  if (e instanceof Anthropic.BadRequestError) return `Amazon Bedrock rejected the request: ${String(e.message).slice(0, 300)}`
  if (e instanceof Anthropic.APIError && e.status) return `Amazon Bedrock error ${e.status}. Try again later.`
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach Amazon Bedrock. Try again later.'
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
    trigger: d.trigger || 'manual',
    skillName: d.skillName || '',
    latencyMs: typeof d.latencyMs === 'number' ? d.latencyMs : null,
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
  TRIGGERS,
  WRAPUP_PROMPT,
  profileLines,
  computedFacts,
  unfenceHtml,
  MODEL,
  REGION,
  buildInput,
  userMessage,
  analyze,
  failureText,
  publicAnalysis
}
