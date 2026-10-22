const assessments = require('../assessments/schema')
const responses = require('../guided-discovery/schema')
const { withDb, isNotFound } = require('../lib/db')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const reply = (statusCode, body) => ({ statusCode, headers, body })

const MAX_LIMIT = 500

// Datasets the viewer can read: profiles (the initial form) and responses (the answers). Both
// carry `assessment` and use the same status values. 'guided-discovery' is the old name for responses.
const RESPONSES = { collection: responses.COLLECTION, idField: 'responseId', statuses: responses.STATUSES }
const DATASETS = {
  assessments: { collection: assessments.COLLECTION, idField: 'submissionId', statuses: assessments.STATUSES },
  responses: RESPONSES,
  'guided-discovery': RESPONSES
}

// Admin read API for the submissions viewer. Contains PII, so the action is deployed with
// `require-adobe-auth: true`: the gateway only lets through a valid Adobe IMS user token that
// belongs to this project's org (sent as Authorization + x-gw-ims-org-id by the UI).
//   GET ?dataset=assessments|responses &status=started|in_progress|completed &limit=1..500 &skip=0
//   -> { ok, dataset, total, count, items } newest first
//        &assessment=self-guided (assessments only)
//   POST {op:'delete', dataset, id} -> { ok, deleted: 1 } permanently removes one record (404 if absent)
//   POST {op:'delete', dataset, ids:[...]} -> { ok, deleted, notFound } removes up to 100 records
//        (legacy body {op:'delete', submissionId} deletes from assessments)
async function main (params) {
  const dataset = params.dataset || 'assessments'
  const ds = DATASETS[dataset]
  if (!ds) return reply(400, { ok: false, error: 'invalid dataset' })
  const method = (params.__ow_method || 'get').toLowerCase()
  if (method === 'post') return run(params, ds, (col) => remove(col, ds, params))
  if (method !== 'get') return reply(405, { ok: false, error: 'method not allowed' })

  const filter = {}
  if (params.status) {
    if (!ds.statuses.includes(params.status)) return reply(400, { ok: false, error: 'invalid status' })
    filter.status = params.status
  }
  if (params.assessment) {
    if (!assessments.ASSESSMENT_IDS.includes(params.assessment)) {
      return reply(400, { ok: false, error: 'invalid assessment' })
    }
    filter.assessment = params.assessment
  }
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 200, 1), MAX_LIMIT)
  const skip = Math.max(parseInt(params.skip, 10) || 0, 0)

  return run(params, ds, async (col, client) => {
    const total = await col.countDocuments(filter)
    const items = total
      ? await col.find(filter).sort('createdAt', -1).skip(skip).limit(limit).toArray()
      : []
    if (ds === RESPONSES) await attachProfiles(client, items)
    return reply(200, { ok: true, dataset, total, count: items.length, items })
  })
}

// Responses only reference the profile (submissionId, captured by the assessment's initial form);
// attach it so the viewer can show whose answers they are.
async function attachProfiles (client, items) {
  const ids = [...new Set(items.map((i) => i.submissionId).filter(Boolean))]
  if (!ids.length) return
  const profiles = await client.collection(assessments.COLLECTION)
    .find({ submissionId: { $in: ids } }).limit(ids.length).toArray()
  const byId = new Map(profiles.map((l) => [l.submissionId, l.profile]))
  items.forEach((i) => {
    if (byId.has(i.submissionId)) i.profile = byId.get(i.submissionId)
  })
}

const MAX_DELETE = 100

async function remove (col, ds, params) {
  if (params.op !== 'delete') return reply(400, { ok: false, error: 'op must be delete' })
  if (params.ids !== undefined) return removeMany(col, ds, params.ids)
  const id = params.id || params[ds.idField]
  if (!UUID_RE.test(id || '')) return reply(400, { ok: false, error: 'invalid id' })
  const res = await col.deleteOne({ [ds.idField]: id })
  if (!res || !res.deletedCount) return reply(404, { ok: false, error: 'not found' })
  console.log('assessments-admin deleted', ds.collection, id)
  return reply(200, { ok: true, deleted: res.deletedCount })
}

// Deletes each listed record; ids that are already gone are reported, not treated as errors.
async function removeMany (col, ds, input) {
  const ids = Array.isArray(input) ? [...new Set(input)] : []
  if (!ids.length || ids.length > MAX_DELETE) return reply(400, { ok: false, error: `ids must list 1 to ${MAX_DELETE} records` })
  if (!ids.every((id) => UUID_RE.test(String(id)))) return reply(400, { ok: false, error: 'invalid id' })
  let deleted = 0
  const notFound = []
  for (const id of ids) {
    let res = null
    try { res = await col.deleteOne({ [ds.idField]: id }) } catch (e) { if (!isNotFound(e)) throw e }
    if (res && res.deletedCount) deleted += res.deletedCount
    else notFound.push(id)
  }
  console.log('assessments-admin deleted', ds.collection, deleted, 'of', ids.length)
  return reply(200, { ok: true, deleted, notFound })
}

async function run (params, ds, fn) {
  try {
    return await withDb(params, (client) => fn(client.collection(ds.collection), client))
  } catch (e) {
    if (isNotFound(e)) return reply(404, { ok: false, error: 'not found' })
    console.error('assessments-admin failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

exports.main = main
