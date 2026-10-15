const crypto = require('crypto')
const { computeResult } = require('../../../blocks/guided-discovery/lib/scoring.js')
const {
  COLLECTION, SCHEMA_VERSION, INDEXES,
  leadRefId, cleanSource, validateSection, validateProgress, isStructuredKey, validateStructured
} = require('./schema')
const assessments = require('../assessments/schema')
const { withCors } = require('../lib/cors')
const { withDb, findOneOrNull, ensureIndexes } = require('../lib/db')

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const reply = (statusCode, body) => ({ statusCode, headers, body })
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const hasErrors = (errors) => Object.keys(errors).length > 0

// Published structured-content documents for "sc-<sectionId>" sections (DA structured content
// delivery). Cached per warm container; preview vs live follows the page the visitor is on.
const SC_BASE = 'https://da-sc.adobeaem.workers.dev'
const SC_PATH = 'adobedevxsc/guided-discovery/forms/guided-discovery'
const SC_TTL_MS = 60 * 1000
const scCache = new Map()
async function structuredDoc (sectionKey, env) {
  const id = sectionKey.slice(3)
  const which = env === 'preview' ? 'preview' : 'live'
  const cacheKey = `${which}/${id}`
  const hit = scCache.get(cacheKey)
  if (hit && Date.now() - hit.at < SC_TTL_MS) return hit.doc
  try {
    const res = await fetch(`${SC_BASE}/${which}/${SC_PATH}/${id}`)
    if (res.status === 404) return { missing: true }
    if (!res.ok) return null
    const json = await res.json()
    const doc = json && json.data ? json.data : null
    scCache.set(cacheKey, { at: Date.now(), doc })
    return doc
  } catch (e) {
    return null // delivery unreachable: fall back to shape-only validation
  }
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

// Public endpoint for the self-guided AA -> CJA Guided Discovery. A session is token-gated by its
// random sessionId, which the browser keeps to autosave and resume.
//   POST {op:'start', leadRef?, source, contentVersion}            -> 201 {sessionId, linked}
//   POST {op:'link', sessionId, leadRef}                           -> 200 {linked} (only if not yet linked)
//   POST {op:'save', sessionId, section, rev, data, progress?}     -> 200 {rev, savedAt}; 409 if rev is stale
//   POST {op:'save', sessionId, progress}                          -> 200 (progress only)
//   POST {op:'complete', sessionId}                                -> 200 {result}
//   GET  ?sessionId=...                                            -> 200 {session}
async function handle (raw) {
  const params = readBody(raw)
  const method = (params.__ow_method || 'get').toLowerCase()
  // honeypot: real users never fill this hidden field
  if (params.website) return reply(200, { ok: true })
  if (method !== 'get' && method !== 'post') return reply(405, { ok: false, error: 'method not allowed' })
  if (method === 'post' && !['start', 'save', 'complete', 'link'].includes(params.op)) {
    return reply(400, { ok: false, error: 'op must be start, save, link or complete' })
  }
  if ((method === 'get' || params.op !== 'start') && !UUID_RE.test(params.sessionId || '')) {
    return reply(400, { ok: false, error: 'invalid sessionId' })
  }

  try {
    return await withDb(params, async (client) => {
      const col = client.collection(COLLECTION)
      await ensureIndexes(col, INDEXES)
      if (method === 'get') return resume(col, params)
      if (params.op === 'start') return start(client, col, params)
      if (params.op === 'save') return save(col, params)
      if (params.op === 'link') return link(client, col, params)
      return complete(col, params)
    })
  } catch (e) {
    console.error('guided-discovery failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

// A lead reference is stored only if that CJA assessment submission actually exists.
async function verifiedLeadRef (client, input) {
  const submissionId = leadRefId(input)
  if (!submissionId) return null
  const found = await findOneOrNull(client.collection(assessments.COLLECTION), { submissionId })
  return found ? { kind: 'cja-assessment', submissionId } : null
}

async function start (client, col, params) {
  const leadRef = await verifiedLeadRef(client, params.leadRef)
  const now = new Date().toISOString()
  const sessionId = crypto.randomUUID()
  await col.insertOne({
    sessionId,
    schemaVersion: SCHEMA_VERSION,
    contentVersion: String(params.contentVersion || '').slice(0, 40),
    viewProfile: 'selfguided',
    status: 'started',
    leadRef,
    source: cleanSource(params.source),
    progress: { completed: [] },
    sections: {},
    sectionMeta: {},
    result: null,
    client: { userAgent: String((params.__ow_headers || {})['user-agent'] || '').slice(0, 300) },
    createdAt: now,
    updatedAt: now,
    completedAt: null
  })
  return reply(201, { ok: true, sessionId, linked: Boolean(leadRef) })
}

async function link (client, col, params) {
  const doc = await findOneOrNull(col, { sessionId: params.sessionId })
  if (!doc) return reply(404, { ok: false, error: 'not found' })
  if (doc.leadRef) return reply(200, { ok: true, linked: true, changed: false })
  const leadRef = await verifiedLeadRef(client, params.leadRef)
  if (!leadRef) return reply(200, { ok: true, linked: false })
  await col.updateOne({ sessionId: params.sessionId }, { $set: { leadRef, updatedAt: new Date().toISOString() } })
  return reply(200, { ok: true, linked: true, changed: true })
}

async function save (col, params) {
  const hasSection = params.section !== undefined
  if (!hasSection && params.progress === undefined) {
    return reply(400, { ok: false, error: 'section or progress required' })
  }
  const rev = Number(params.rev)
  if (hasSection && !(Number.isInteger(rev) && rev >= 1)) {
    return reply(400, { ok: false, error: 'rev must be a positive integer' })
  }
  const errors = {}
  let data
  if (hasSection && isStructuredKey(params.section)) {
    const doc = await structuredDoc(params.section, params.contentEnv)
    if (doc && doc.missing) return reply(400, { ok: false, errors: { section: 'unknown structured section' } })
    const v = validateStructured(params.section, params.data, doc)
    Object.assign(errors, v.errors)
    data = v.data
  } else if (hasSection) {
    const v = validateSection(params.section, params.data)
    Object.assign(errors, v.errors)
    data = v.data
  }
  const p = validateProgress(params.progress)
  Object.assign(errors, p.errors)
  if (hasErrors(errors)) return reply(400, { ok: false, errors })

  const doc = await findOneOrNull(col, { sessionId: params.sessionId })
  if (!doc) return reply(404, { ok: false, error: 'not found' })

  const now = new Date().toISOString()
  const set = { updatedAt: now }
  if (hasSection) {
    const stored = ((doc.sectionMeta || {})[params.section] || {}).rev || 0
    if (rev <= stored) return reply(409, { ok: false, error: 'stale revision', rev: stored })
    set[`sections.${params.section}`] = data
    set[`sectionMeta.${params.section}`] = { rev, savedAt: now }
  }
  if (p.progress) set.progress = { ...(doc.progress || {}), ...p.progress }
  if (doc.status === 'completed') {
    // edits after completion keep the server-side recommendation current
    const sections = hasSection ? { ...(doc.sections || {}), [params.section]: data } : doc.sections
    set.result = { ...computeResult(sections), computedAt: now }
  } else {
    set.status = 'in_progress'
  }
  await col.updateOne({ sessionId: params.sessionId }, { $set: set })
  return reply(200, { ok: true, ...(hasSection ? { rev } : {}), savedAt: now })
}

async function complete (col, params) {
  const doc = await findOneOrNull(col, { sessionId: params.sessionId })
  if (!doc) return reply(404, { ok: false, error: 'not found' })
  const now = new Date().toISOString()
  const result = { ...computeResult(doc.sections || {}), computedAt: now }
  await col.updateOne(
    { sessionId: params.sessionId },
    { $set: { status: 'completed', result, completedAt: doc.completedAt || now, updatedAt: now } }
  )
  return reply(200, { ok: true, result })
}

async function resume (col, params) {
  const doc = await findOneOrNull(col, { sessionId: params.sessionId })
  if (!doc) return reply(404, { ok: false, error: 'not found' })
  const revs = Object.fromEntries(Object.entries(doc.sectionMeta || {}).map(([k, m]) => [k, m.rev]))
  const session = {
    sessionId: doc.sessionId,
    status: doc.status,
    contentVersion: doc.contentVersion,
    linked: Boolean(doc.leadRef),
    leadSubmissionId: doc.leadRef ? doc.leadRef.submissionId : null,
    sections: doc.sections || {},
    revs,
    progress: doc.progress || { completed: [] },
    result: doc.result,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    completedAt: doc.completedAt
  }
  return reply(200, { ok: true, session })
}

exports.main = withCors(handle)
