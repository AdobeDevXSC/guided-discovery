const { generateAccessToken } = require('@adobe/aio-sdk').Core.AuthClient
const libDb = require('@adobe/aio-lib-db')

const COLLECTION = 'items'
const headers = { 'Content-Type': 'application/json' }

// GET  -> list items (optional ?limit=)
// POST -> insert the JSON body as a document
async function main (params) {
  const method = (params.__ow_method || 'get').toLowerCase()
  let client
  try {
    const token = await generateAccessToken(params)
    const db = await libDb.init({ token: token.access_token, region: params.region })
    client = await db.connect()
    const items = client.collection(COLLECTION)

    if (method === 'post') {
      const { __ow_method, __ow_headers, __ow_path, __ow_query, __ow_body, ...doc } = params
      const result = await items.insertOne({ ...stripCreds(doc), createdAt: new Date().toISOString() })
      return { statusCode: 201, headers, body: { ok: true, result } }
    }

    const limit = Number(params.limit) || 50
    const docs = await items.find({}).limit(limit).toArray()
    return { statusCode: 200, headers, body: { ok: true, items: docs } }
  } catch (e) {
    return { statusCode: 500, headers, body: { ok: false, error: e.message } }
  } finally {
    if (client) await client.close()
  }
}

// drop runtime-injected params so credentials are never persisted
function stripCreds (doc) {
  return Object.fromEntries(Object.entries(doc).filter(([k]) => !/^(LOG_LEVEL|SERVICE_API_KEY|OAUTH_|IMS_|TECH_ACCT|region|limit)/i.test(k) && !/(secret|token|auth)/i.test(k)))
}

exports.main = main
