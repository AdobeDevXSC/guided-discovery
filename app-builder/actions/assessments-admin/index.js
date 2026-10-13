const { generateAccessToken } = require('@adobe/aio-sdk').Core.AuthClient
const libDb = require('@adobe/aio-lib-db')
const { COLLECTION, STATUSES } = require('../assessments/schema')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const reply = (statusCode, body) => ({ statusCode, headers, body })

const MAX_LIMIT = 500

// Admin read API for the submissions viewer. Contains PII, so the action is deployed with
// `require-adobe-auth: true`: the gateway only lets through a valid Adobe IMS user token that
// belongs to this project's org (sent as Authorization + x-gw-ims-org-id by the UI).
//   GET ?status=started|in_progress|completed &limit=1..500 &skip=0
//   -> { ok, total, count, items: [assessment...] } newest first
//   POST {op:'delete', submissionId} -> { ok, deleted: 1 } permanently removes one submission (404 if absent)
async function main (params) {
  const method = (params.__ow_method || 'get').toLowerCase()
  if (method === 'post') return withDb(params, col => remove(col, params))
  if (method !== 'get') return reply(405, { ok: false, error: 'method not allowed' })

  const filter = {}
  if (params.status) {
    if (!STATUSES.includes(params.status)) return reply(400, { ok: false, error: 'invalid status' })
    filter.status = params.status
  }
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 200, 1), MAX_LIMIT)
  const skip = Math.max(parseInt(params.skip, 10) || 0, 0)

  return withDb(params, async col => {
    const total = await col.countDocuments(filter)
    const items = total
      ? await col.find(filter).sort('createdAt', -1).skip(skip).limit(limit).toArray()
      : []
    return reply(200, { ok: true, total, count: items.length, items })
  })
}

async function remove (col, params) {
  if (params.op !== 'delete') return reply(400, { ok: false, error: 'op must be delete' })
  if (!UUID_RE.test(params.submissionId || '')) return reply(400, { ok: false, error: 'invalid submissionId' })
  const res = await col.deleteOne({ submissionId: params.submissionId })
  if (!res || !res.deletedCount) return reply(404, { ok: false, error: 'not found' })
  console.log('assessments-admin deleted submission', params.submissionId)
  return reply(200, { ok: true, deleted: res.deletedCount })
}

// Opens the database connection, runs fn(collection), and always closes the client.
async function withDb (params, fn) {
  let client
  try {
    // scopes arrive as a comma-separated string from app.config.yaml inputs
    const scopes = Array.isArray(params.scopes) ? params.scopes : String(params.scopes || '').split(',').filter(Boolean)
    const token = await generateAccessToken({ ...params, scopes })
    const db = await libDb.init({ token: token.access_token, region: params.region })
    client = await db.connect()
    return await fn(client.collection(COLLECTION))
  } catch (e) {
    // the SDK throws (instead of returning null/0) when a target document does not exist
    if (/document not found/i.test(e.message)) return reply(404, { ok: false, error: 'not found' })
    console.error('assessments-admin failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  } finally {
    if (client) await client.close()
  }
}

exports.main = main
