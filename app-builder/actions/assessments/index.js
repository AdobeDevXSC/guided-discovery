const crypto = require('crypto')
const {
  COLLECTION, USERS_COLLECTION, ASSESSMENT_IDS, DEFAULT_ASSESSMENT, SCHEMA_VERSION, CONSENT_VERSION, INDEXES, USER_INDEXES,
  validateProfile, cleanSource, validateSection
} = require('./schema')
const { withCors } = require('../lib/cors')
const { withDb, findOneOrNull, ensureIndexes } = require('../lib/db')

const headers = { 'Content-Type': 'application/json' }
const reply = (statusCode, body) => ({ statusCode, headers, body })
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const findBySubmissionId = (col, submissionId) => findOneOrNull(col, { submissionId })

// Public, token-gated by `submissionId` (a random UUID handed back on create).
//   POST {op:'create', profile, consent:true, source, assessment?} -> 201 {submissionId, userId}
//        assessment defaults to 'self-guided'
//        userId is stable per person (keyed on the lowercased email); submissionId is per submission
//   POST {op:'section', submissionId, section, answers}      -> 200 (upserts that section)
//   POST {op:'complete', submissionId, summary?}             -> 200
//   GET  ?submissionId=...                                   -> 200 {assessment}
async function handle (params) {
  const method = (params.__ow_method || 'get').toLowerCase()
  // honeypot: real users never fill this hidden field
  if (params.website) return reply(200, { ok: true })
  try {
    return await withDb(params, async (client) => {
      const col = client.collection(COLLECTION)
      await ensureIndexes(col, INDEXES)
      const users = client.collection(USERS_COLLECTION)
      await ensureIndexes(users, USER_INDEXES)

      if (method === 'get') return get(col, params)
      if (method !== 'post') return reply(405, { ok: false, error: 'method not allowed' })

      switch (params.op) {
        case 'create': return create(col, users, params)
        case 'section': return saveSection(col, params)
        case 'complete': return complete(col, params)
        default: return reply(400, { ok: false, error: 'op must be create, section or complete' })
      }
    })
  } catch (e) {
    console.error('assessments failed:', e.name, e.httpStatusCode, e.message)
    if (e.httpStatusCode === 404) return reply(404, { ok: false, error: 'not found' })
    return reply(500, { ok: false, error: 'internal error', upstreamStatus: e.httpStatusCode || null })
  }
}

// The person's userId, created on their first submission. The unique email index settles a
// race between two first submissions: the loser's insert fails and it reads the winner's id.
async function userIdFor (users, email, now) {
  const existing = await findOneOrNull(users, { email })
  if (existing) return existing.userId
  const userId = crypto.randomUUID()
  try {
    await users.insertOne({ userId, email, createdAt: now })
    return userId
  } catch (e) {
    const winner = await findOneOrNull(users, { email })
    if (winner) return winner.userId
    throw e
  }
}

async function create (col, users, params) {
  const { profile, errors } = validateProfile(params.profile)
  if (params.consent !== true) errors.consent = 'consent required'
  const assessment = params.assessment || DEFAULT_ASSESSMENT
  if (!ASSESSMENT_IDS.includes(assessment)) errors.assessment = 'unknown assessment'
  if (Object.keys(errors).length) return reply(400, { ok: false, errors })

  const now = new Date().toISOString()
  const submissionId = crypto.randomUUID()
  const userId = await userIdFor(users, profile.email, now)
  await col.insertOne({
    submissionId,
    userId,
    assessment,
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
  return reply(201, { ok: true, submissionId, userId })
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

exports.main = withCors(handle)
