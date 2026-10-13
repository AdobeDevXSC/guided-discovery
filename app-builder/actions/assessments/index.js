const crypto = require('crypto')
const { generateAccessToken } = require('@adobe/aio-sdk').Core.AuthClient
const libDb = require('@adobe/aio-lib-db')
const {
  COLLECTION, SCHEMA_VERSION, CONSENT_VERSION, INDEXES,
  validateProfile, cleanSource, validateSection
} = require('./schema')
const { isAllowedOrigin, originOf, corsHeaders } = require('./cors')

const headers = { 'Content-Type': 'application/json' }
const reply = (statusCode, body) => ({ statusCode, headers, body })
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// The SDK throws (rather than returning null) when findOne matches nothing.
async function findBySubmissionId (col, submissionId) {
  try {
    return await col.findOne({ submissionId })
  } catch (e) {
    if (/document not found/i.test(e.message)) return null
    throw e
  }
}

let indexesEnsured = false
async function ensureIndexes (col) {
  if (indexesEnsured) return
  for (const { spec, options } of INDEXES) {
    try { await col.createIndex(spec, options) } catch (e) { /* already exists or unsupported: non-fatal */ }
  }
  indexesEnsured = true
}

// Public, token-gated by `submissionId` (a random UUID handed back on create).
//   POST {op:'create', profile, consent:true, source}        -> 201 {submissionId}
//   POST {op:'section', submissionId, section, answers}      -> 200 (upserts that section)
//   POST {op:'complete', submissionId, summary?}             -> 200
//   GET  ?submissionId=...                                   -> 200 {assessment}
async function handle (params) {
  const method = (params.__ow_method || 'get').toLowerCase()
  let client
  try {
    // honeypot: real users never fill this hidden field
    if (params.website) return reply(200, { ok: true })

    const token = await generateAccessToken(params)
    const db = await libDb.init({ token: token.access_token, region: params.region })
    client = await db.connect()
    const col = client.collection(COLLECTION)
    await ensureIndexes(col)

    if (method === 'get') return await get(col, params)
    if (method !== 'post') return reply(405, { ok: false, error: 'method not allowed' })

    switch (params.op) {
      case 'create': return await create(col, params)
      case 'section': return await saveSection(col, params)
      case 'complete': return await complete(col, params)
      default: return reply(400, { ok: false, error: 'op must be create, section or complete' })
    }
  } catch (e) {
    console.error('assessments failed:', e.name, e.httpStatusCode, e.message)
    if (e.httpStatusCode === 404) return reply(404, { ok: false, error: 'not found' })
    return reply(500, { ok: false, error: 'internal error', upstreamStatus: e.httpStatusCode || null })
  } finally {
    if (client) await client.close()
  }
}

async function create (col, params) {
  const { profile, errors } = validateProfile(params.profile)
  if (params.consent !== true) errors.consent = 'consent required'
  if (Object.keys(errors).length) return reply(400, { ok: false, errors })

  const now = new Date().toISOString()
  const submissionId = crypto.randomUUID()
  await col.insertOne({
    submissionId,
    schemaVersion: SCHEMA_VERSION,
    status: 'started',
    profile,
    consent: { marketingContact: true, version: CONSENT_VERSION, acceptedAt: now },
    source: cleanSource(params.source),
    client: { userAgent: String((params.__ow_headers || {})['user-agent'] || '').slice(0, 300) },
    sections: {},
    summary: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  })
  return reply(201, { ok: true, submissionId })
}

async function saveSection (col, params) {
  if (!UUID_RE.test(params.submissionId || '')) return reply(400, { ok: false, error: 'invalid submissionId' })
  const { section, answers, errors } = validateSection(params.section, params.answers)
  if (Object.keys(errors).length) return reply(400, { ok: false, errors })

  const existing = await findBySubmissionId(col, params.submissionId)
  if (!existing) return reply(404, { ok: false, error: 'not found' })
  if (existing.status === 'completed') return reply(409, { ok: false, error: 'already completed' })

  const now = new Date().toISOString()
  await col.updateOne(
    { submissionId: params.submissionId },
    { $set: { [`sections.${section}`]: { answers, savedAt: now }, status: 'in_progress', updatedAt: now } }
  )
  return reply(200, { ok: true })
}

async function complete (col, params) {
  if (!UUID_RE.test(params.submissionId || '')) return reply(400, { ok: false, error: 'invalid submissionId' })
  const summary = params.summary && typeof params.summary === 'object' && JSON.stringify(params.summary).length < 50000
    ? params.summary
    : null
  const existing = await findBySubmissionId(col, params.submissionId)
  if (!existing) return reply(404, { ok: false, error: 'not found' })

  const now = new Date().toISOString()
  await col.updateOne(
    { submissionId: params.submissionId },
    { $set: { status: 'completed', summary, completedAt: now, updatedAt: now } }
  )
  return reply(200, { ok: true })
}

async function get (col, params) {
  if (!UUID_RE.test(params.submissionId || '')) return reply(400, { ok: false, error: 'invalid submissionId' })
  const doc = await findBySubmissionId(col, params.submissionId)
  if (!doc) return reply(404, { ok: false, error: 'not found' })
  const { _id, client, ...assessment } = doc
  return reply(200, { ok: true, assessment })
}

// CORS gate: a request carrying an Origin that is not an allowed EDS origin is rejected.
// Requests with no Origin (server-side callers, curl) are not browser traffic and pass through;
// CORS cannot protect against those, so pair this with rate limiting.
async function main (params) {
  const origin = originOf(params)
  const cors = corsHeaders(origin)
  const method = (params.__ow_method || 'get').toLowerCase()

  if (method === 'options') {
    return { statusCode: cors['Access-Control-Allow-Origin'] ? 204 : 400, headers: cors, body: '' }
  }
  if (origin && !isAllowedOrigin(origin)) {
    return { statusCode: 400, headers, body: { ok: false, error: 'origin not allowed' } }
  }
  const res = await handle(params)
  return { ...res, headers: { ...res.headers, ...cors } }
}

exports.main = main
