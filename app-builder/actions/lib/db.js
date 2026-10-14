const { generateAccessToken } = require('@adobe/aio-sdk').Core.AuthClient
const libDb = require('@adobe/aio-lib-db')

// Opens the App Builder database, runs fn(client), and always closes the client.
// Credentials come from include-ims-credentials or, for require-adobe-auth actions, from inputs
// (where scopes arrive as a comma-separated string).
async function withDb (params, fn) {
  const scopes = Array.isArray(params.scopes) ? params.scopes : String(params.scopes || '').split(',').filter(Boolean)
  const token = await generateAccessToken(scopes.length ? { ...params, scopes } : params)
  const db = await libDb.init({ token: token.access_token, region: params.region })
  const client = await db.connect()
  try {
    return await fn(client)
  } finally {
    await client.close()
  }
}

// The SDK throws (rather than returning null) when a target document does not exist.
const isNotFound = (e) => /document not found/i.test((e && e.message) || '')

async function findOneOrNull (col, filter) {
  try {
    return await col.findOne(filter)
  } catch (e) {
    if (isNotFound(e)) return null
    throw e
  }
}

// Creates indexes once per warm container; failures (already exists / unsupported) are non-fatal.
const ensured = new Set()
async function ensureIndexes (col, indexes) {
  if (ensured.has(col.name)) return
  for (const { spec, options } of indexes) {
    try { await col.createIndex(spec, options) } catch (e) { /* non-fatal */ }
  }
  ensured.add(col.name)
}

module.exports = { withDb, isNotFound, findOneOrNull, ensureIndexes }
