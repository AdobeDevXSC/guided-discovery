const { generateAccessToken } = require('@adobe/aio-sdk').Core.AuthClient
const libDb = require('@adobe/aio-lib-db')
const { COLLECTION, STATUSES } = require('../assessments/schema')

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const reply = (statusCode, body) => ({ statusCode, headers, body })

const MAX_LIMIT = 500

// Admin read API for the submissions viewer. Contains PII, so the action is deployed with
// `require-adobe-auth: true`: the gateway only lets through a valid Adobe IMS user token that
// belongs to this project's org (sent as Authorization + x-gw-ims-org-id by the UI).
//   GET ?status=started|in_progress|completed &limit=1..500 &skip=0
//   -> { ok, total, count, items: [assessment...] } newest first
async function main (params) {
  if ((params.__ow_method || 'get').toLowerCase() !== 'get') {
    return reply(405, { ok: false, error: 'method not allowed' })
  }

  const filter = {}
  if (params.status) {
    if (!STATUSES.includes(params.status)) return reply(400, { ok: false, error: 'invalid status' })
    filter.status = params.status
  }
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 200, 1), MAX_LIMIT)
  const skip = Math.max(parseInt(params.skip, 10) || 0, 0)

  let client
  try {
    // scopes arrive as a comma-separated string from app.config.yaml inputs
    const scopes = Array.isArray(params.scopes) ? params.scopes : String(params.scopes || '').split(',').filter(Boolean)
    const token = await generateAccessToken({ ...params, scopes })
    const db = await libDb.init({ token: token.access_token, region: params.region })
    client = await db.connect()
    const col = client.collection(COLLECTION)

    const total = await col.countDocuments(filter)
    const items = total
      ? await col.find(filter).sort('createdAt', -1).skip(skip).limit(limit).toArray()
      : []
    return reply(200, { ok: true, total, count: items.length, items })
  } catch (e) {
    console.error('assessments-admin failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  } finally {
    if (client) await client.close()
  }
}

exports.main = main
