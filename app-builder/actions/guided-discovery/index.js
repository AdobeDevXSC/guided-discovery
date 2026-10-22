const crypto = require('crypto')
const { computeSummary } = require('../../../blocks/gd-summary/scoring.js')
const {
  COLLECTION, SCHEMA_VERSION, INDEXES,
  leadRefId, cleanSource, validateProgress, sectionIdOf, validateStructured
} = require('./schema')
const assessments = require('../assessments/schema')
const { withCors } = require('../lib/cors')
const { withDb, findOneOrNull, ensureIndexes } = require('../lib/db')

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const reply = (statusCode, body) => ({ statusCode, headers, body })
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const hasErrors = (errors) => Object.keys(errors).length > 0

// Where each assessment's questions are authored (DA structured content, one document per
// section plus a summary), as published through the structured content delivery service.
const SC_BASE = 'https://da-sc.adobeaem.workers.dev'
const CONTENT = {
  'self-guided': 'adobedevxsc/guided-discovery/forms/guided-discovery'
}

// Published documents are cached per warm container; preview vs live follows the visitor's page.
const SC_TTL_MS = 60 * 1000
const scCache = new Map()
async function structuredDoc (assessment, id, env) {
  const which = env === 'preview' ? 'preview' : 'live'
  const cacheKey = `${which}/${assessment}/${id}`
  const hit = scCache.get(cacheKey)
  if (hit && Date.now() - hit.at < SC_TTL_MS) return hit.doc
  try {
    const res = await fetch(`${SC_BASE}/${which}/${CONTENT[assessment]}/${id}`)
    if (res.status === 404) return { missing: true }
    if (!res.ok) return null
    const json = await res.json()
    const data = json && json.data ? json.data : null
    // a short fingerprint of the exact published version the answers were checked against
    const hash = data ? crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16) : null
    const doc = data ? { data, hash } : null
    scCache.set(cacheKey, { at: Date.now(), doc })
    return doc
  } catch (e) {
    return null // delivery unreachable: fall back to shape-only validation
  }
}

// The recommendation, scored from the published summary and section documents (same module as the
// gd-summary block). Returns null when the content can't be fetched right now.
async function scoredResult (assessment, sections, env) {
  const summary = await structuredDoc(assessment, 'summary', env)
  if (!summary || summary.missing) return null
  const ids = Array.isArray(summary.data.sections) ? summary.data.sections : []
  const loaded = await Promise.all(ids.map((id) => structuredDoc(assessment, id, env)))
  if (loaded.some((d) => !d)) return null
  const docs = Object.fromEntries(ids.map((id, i) => [id, loaded[i].missing ? {} : loaded[i].data]))
  return computeSummary(summary.data, docs, sections || {})
}

// The browser's tab-close save is sent as text/plain (a CORS-safelisted type, so no preflight);
// the web action then receives the raw body in __ow_body instead of merged params.
function readBody (params) {
  if (params.op || typeof params.__ow_body !== 'string') return params
  for (const decode of [(b) => b, (b) => Buffer.from(b, 'base64').toString('utf8')]) {
    try {
      const parsed = JSON.parse(decode(params.__ow_body))
      if (parsed && typeof parsed === 'object') return { ...params, ...parsed }
    } catch (e) { /* try next decoding */ }
  }
  return params
}

// Public endpoint for assessment responses (collection assessment_responses). A response is
// token-gated by its random responseId, which the browser keeps to autosave and resume.
//   POST {op:'start', assessment?, leadRef?, source, contentVersion} -> 201 {responseId, linked}
//   POST {op:'link', responseId, leadRef}                    -> 200 {linked} (only if not yet linked)
//   POST {op:'save', responseId, section, rev, data, progress?} -> 200 {rev, savedAt}; 409 if rev is stale
//   POST {op:'save', responseId, progress}                   -> 200 (progress only)
//   POST {op:'complete', responseId, contentEnv?}            -> 200 {result}; 503 if content is unreachable
//   GET  ?responseId=...                                     -> 200 {response}
// Clients from before the rename send sessionId (and read sessionId / session back); both are
// accepted and answered, and "sc-<sectionId>" section keys are accepted as <sectionId>.
async function handle (raw) {
  const params = readBody(raw)
  const method = (params.__ow_method || 'get').toLowerCase()
  // honeypot: real users never fill this hidden field
  if (params.website) return reply(200, { ok: true })
  if (method !== 'get' && method !== 'post') return reply(405, { ok: false, error: 'method not allowed' })
  if (method === 'post' && !['start', 'save', 'complete', 'link'].includes(params.op)) {
    return reply(400, { ok: false, error: 'op must be start, save, link or complete' })
  }
  const responseId = params.responseId || params.sessionId
  if ((method === 'get' || params.op !== 'start') && !UUID_RE.test(responseId || '')) {
    return reply(400, { ok: false, error: 'invalid responseId' })
  }

  try {
    return await withDb(params, async (client) => {
      const col = client.collection(COLLECTION)
      await ensureIndexes(col, INDEXES)
      if (method === 'get') return resume(col, responseId)
      if (params.op === 'start') return start(client, col, params)
      if (params.op === 'save') return save(col, responseId, params)
      if (params.op === 'link') return link(client, col, responseId, params)
      return complete(col, responseId, params)
    })
  } catch (e) {
    console.error('guided-discovery failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

// The profile behind a ?lead= hand-off, only if that submission exists (and for this assessment).
async function verifiedLead (client, input, assessment) {
  const submissionId = leadRefId(input)
  if (!submissionId) return null
  const found = await findOneOrNull(client.collection(assessments.COLLECTION), { submissionId })
  if (!found || (found.assessment && found.assessment !== assessment)) return null
  return { submissionId, userId: found.userId || null }
}

async function start (client, col, params) {
  const assessment = params.assessment || assessments.DEFAULT_ASSESSMENT
  if (!CONTENT[assessment]) return reply(400, { ok: false, errors: { assessment: 'unknown assessment' } })
  const lead = await verifiedLead(client, params.leadRef, assessment)
  const now = new Date().toISOString()
  const responseId = crypto.randomUUID()
  await col.insertOne({
    responseId,
    schemaVersion: SCHEMA_VERSION,
    assessment,
    userId: lead ? lead.userId : null,
    submissionId: lead ? lead.submissionId : null,
    status: 'started',
    contentVersion: String(params.contentVersion || '').slice(0, 40),
    contentEnv: params.contentEnv === 'preview' ? 'preview' : 'live',
    source: cleanSource(params.source),
    sections: {},
    progress: { completed: [] },
    result: null,
    client: { userAgent: String((params.__ow_headers || {})['user-agent'] || '').slice(0, 300) },
    createdAt: now,
    updatedAt: now,
    completedAt: null
  })
  return reply(201, { ok: true, responseId, sessionId: responseId, linked: Boolean(lead) })
}

async function link (client, col, responseId, params) {
  const doc = await findOneOrNull(col, { responseId })
  if (!doc) return reply(404, { ok: false, error: 'not found' })
  if (doc.submissionId) return reply(200, { ok: true, linked: true, changed: false })
  const lead = await verifiedLead(client, params.leadRef, doc.assessment)
  if (!lead) return reply(200, { ok: true, linked: false })
  await col.updateOne({ responseId }, { $set: { ...lead, updatedAt: new Date().toISOString() } })
  return reply(200, { ok: true, linked: true, changed: true })
}

async function save (col, responseId, params) {
  const hasSection = params.section !== undefined
  if (!hasSection && params.progress === undefined) {
    return reply(400, { ok: false, error: 'section or progress required' })
  }
  const sectionId = hasSection ? sectionIdOf(params.section) : null
  if (hasSection && !sectionId) return reply(400, { ok: false, errors: { section: 'unknown section' } })
  const rev = Number(params.rev)
  if (hasSection && !(Number.isInteger(rev) && rev >= 1)) {
    return reply(400, { ok: false, error: 'rev must be a positive integer' })
  }
  const doc = await findOneOrNull(col, { responseId })
  if (!doc) return reply(404, { ok: false, error: 'not found' })

  const errors = {}
  let entry
  if (hasSection) {
    const content = await structuredDoc(doc.assessment, sectionId, params.contentEnv)
    if (content && content.missing) return reply(400, { ok: false, errors: { section: 'unknown section' } })
    const v = validateStructured(sectionId, params.data, content && content.data)
    Object.assign(errors, v.errors)
    entry = { answers: v.data.answers, rev, contentHash: content ? content.hash : null }
  }
  const p = validateProgress(params.progress)
  Object.assign(errors, p.errors)
  if (hasErrors(errors)) return reply(400, { ok: false, errors })

  const now = new Date().toISOString()
  const set = { updatedAt: now }
  if (hasSection) {
    const stored = ((doc.sections || {})[sectionId] || {}).rev || 0
    if (rev <= stored) return reply(409, { ok: false, error: 'stale revision', rev: stored })
    entry.savedAt = now
    set[`sections.${sectionId}`] = entry
  }
  if (p.progress) set.progress = { ...(doc.progress || {}), ...p.progress }
  if (doc.status === 'completed') {
    // edits after completion keep the server-side recommendation current
    const sections = hasSection ? { ...(doc.sections || {}), [sectionId]: entry } : doc.sections
    const result = await scoredResult(doc.assessment, sections, params.contentEnv)
    if (result) set.result = { ...result, computedAt: now }
  } else {
    set.status = 'in_progress'
  }
  await col.updateOne({ responseId }, { $set: set })
  return reply(200, { ok: true, ...(hasSection ? { rev } : {}), savedAt: now })
}

async function complete (col, responseId, params) {
  const doc = await findOneOrNull(col, { responseId })
  if (!doc) return reply(404, { ok: false, error: 'not found' })
  const now = new Date().toISOString()
  const scored = await scoredResult(doc.assessment, doc.sections, params.contentEnv)
  if (!scored) return reply(503, { ok: false, error: 'content unavailable, try again' })
  const result = { ...scored, computedAt: now }
  await col.updateOne(
    { responseId },
    { $set: { status: 'completed', result, completedAt: doc.completedAt || now, updatedAt: now } }
  )
  return reply(200, { ok: true, result })
}

// What the browser needs to resume: answers and revisions per section, progress and the result.
// No profile data is returned (the response only references it).
async function resume (col, responseId) {
  const doc = await findOneOrNull(col, { responseId })
  if (!doc) return reply(404, { ok: false, error: 'not found' })
  const sections = Object.fromEntries(Object.entries(doc.sections || {}).map(([id, s]) => [id, { answers: s.answers || {} }]))
  const revs = Object.fromEntries(Object.entries(doc.sections || {}).map(([id, s]) => [id, s.rev || 0]))
  const response = {
    responseId: doc.responseId,
    assessment: doc.assessment,
    status: doc.status,
    contentVersion: doc.contentVersion,
    linked: Boolean(doc.submissionId),
    leadSubmissionId: doc.submissionId || null,
    sections,
    revs,
    progress: doc.progress || { completed: [] },
    result: doc.result,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    completedAt: doc.completedAt
  }
  // the pre-rename client reads `session`, keyed by "sc-<sectionId>"
  const legacy = (o) => Object.fromEntries(Object.entries(o).map(([id, v]) => [`sc-${id}`, v]))
  const session = {
    ...response, sessionId: doc.responseId, sections: legacy(sections), revs: legacy(revs)
  }
  return reply(200, { ok: true, response, session })
}

exports.main = withCors(handle)
