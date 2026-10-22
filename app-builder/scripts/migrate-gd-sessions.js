/* eslint-disable no-console */
// Copies Guided Discovery sessions (collection gd_sessions, schema v1) into assessment_responses
// (schema v2): sessionId -> responseId, leadRef -> userId/submissionId, "sc-<id>" section keys ->
// <id> with each section's rev/savedAt inline. The old collection is left untouched.
//
//   node scripts/migrate-gd-sessions.js            # dry run: report what would be copied
//   node scripts/migrate-gd-sessions.js --write    # copy (skips responses that already exist)
//
// Uses the ADMIN_IMS_* and AIO_runtime_* values in app-builder/.env.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

process.env.__OW_NAMESPACE = process.env.__OW_NAMESPACE || process.env.AIO_runtime_namespace
process.env.__OW_API_KEY = process.env.__OW_API_KEY || process.env.AIO_runtime_auth
const { withDb, findOneOrNull } = require('../actions/lib/db')
const responses = require('../actions/guided-discovery/schema')
const assessments = require('../actions/assessments/schema')

const write = process.argv.includes('--write')
const env = process.env

function toResponse (s, profile) {
  const lead = s.leadRef || {}
  const sections = {}
  for (const [key, value] of Object.entries(s.sections || {})) {
    const id = key.replace(/^sc-/, '')
    const meta = (s.sectionMeta || {})[key] || {}
    sections[id] = {
      answers: (value && value.answers) || {},
      rev: meta.rev || 1,
      savedAt: meta.savedAt || s.updatedAt,
      contentHash: null
    }
  }
  return {
    responseId: s.sessionId,
    schemaVersion: responses.SCHEMA_VERSION,
    assessment: (profile && profile.assessment) || assessments.DEFAULT_ASSESSMENT,
    userId: lead.userId || (profile && profile.userId) || null,
    submissionId: lead.submissionId || null,
    status: s.status,
    contentVersion: s.contentVersion || '',
    contentEnv: 'live',
    source: s.source || {},
    sections,
    progress: { completed: ((s.progress || {}).completed) || [] },
    result: s.result || null,
    client: s.client || {},
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    completedAt: s.completedAt || null,
    migratedFrom: responses.LEGACY_COLLECTION
  }
}

withDb({
  clientId: env.ADMIN_IMS_CLIENT_ID, clientSecret: env.ADMIN_IMS_CLIENT_SECRET, orgId: env.ADMIN_IMS_ORG_ID, scopes: env.ADMIN_IMS_SCOPES
}, async (client) => {
  const from = client.collection(responses.LEGACY_COLLECTION)
  const to = client.collection(responses.COLLECTION)
  const profiles = client.collection(assessments.COLLECTION)
  const sessions = await (await from.find({})).toArray()
  let copied = 0
  let skipped = 0
  for (const s of sessions) {
    if (!s.sessionId || await findOneOrNull(to, { responseId: s.sessionId })) { skipped += 1; continue }
    const lead = s.leadRef && s.leadRef.submissionId
    const profile = lead ? await findOneOrNull(profiles, { submissionId: lead }) : null
    const doc = toResponse(s, profile)
    console.log(write ? 'copy' : 'would copy', doc.responseId, doc.status, Object.keys(doc.sections).join(',') || '(no answers)', doc.submissionId ? 'linked' : 'unlinked')
    if (write) { await to.insertOne(doc); copied += 1 }
  }
  console.log(`${sessions.length} sessions in ${responses.LEGACY_COLLECTION}; ${write ? `copied ${copied}` : 'dry run'}; skipped ${skipped} already in ${responses.COLLECTION}`)
}).catch((e) => { console.error(e.message); process.exit(1) })
