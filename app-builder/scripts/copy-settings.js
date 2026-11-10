#!/usr/bin/env node
// Copies the admin settings from the Stage database to the Production database, once, after Production is
// deployed (the deploy provisions its database):
//   - app_settings: the encrypted Bedrock API key, the wrap-up skill and the wrap-up template
//   - ai_prompts:   the saved prompts
// The saved API key is copied exactly as stored (encrypted). It stays readable in Production because the
// workflow uses the same AI_KEY_PUBLIC / AI_KEY_PRIVATE pair.
//
//   node scripts/copy-settings.js --prod-file 157OchreTakin-20409-Production.json --dry-run
//   node scripts/copy-settings.js --prod-file 157OchreTakin-20409-Production.json
//   options: --provision   create the Production database first if it does not exist
//            --overwrite   replace documents that already exist in Production (default: leave them alone)
//            --questions   also copy the question bank (assessment_questions)
//
// Reads Stage with the ADMIN_IMS_* values in .env and Production with the credential in the workspace file.
// Only adds or (with --overwrite) updates documents by their own key; it never deletes anything, and it
// prints names and counts, never values.
const fs = require('fs')
const path = require('path')
const { generateAccessToken } = require('@adobe/aio-sdk').Core.AuthClient
const libDb = require('@adobe/aio-lib-db')

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const dry = args.includes('--dry-run')
const overwrite = args.includes('--overwrite')
const prodFile = opt('--prod-file')
if (!prodFile) { console.error('usage: node scripts/copy-settings.js --prod-file <Production workspace json> [--dry-run] [--overwrite] [--questions]'); process.exit(1) }

const env = {}
fs.readFileSync(path.resolve(opt('--env-file', '.env')), 'utf8').split('\n').forEach((l) => { const m = l.match(/^([^#=\s]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') })
const prod = JSON.parse(fs.readFileSync(path.resolve(prodFile), 'utf8')).project
const pd = prod.workspace.details
const s2s = (pd.credentials.find((c) => c.oauth_server_to_server) || {}).oauth_server_to_server

const targets = {
  stage: {
    namespace: env.AIO_runtime_namespace,
    creds: { clientId: env.ADMIN_IMS_CLIENT_ID, clientSecret: env.ADMIN_IMS_CLIENT_SECRET, orgId: env.ADMIN_IMS_ORG_ID, scopes: env.ADMIN_IMS_SCOPES.split(',') }
  },
  production: {
    namespace: pd.runtime.namespaces[0].name,
    creds: { clientId: s2s.client_id, clientSecret: s2s.client_secrets[0], orgId: prod.org.ims_org_id, scopes: s2s.scopes }
  }
}

// collection -> the field that identifies a document in it
const COLLECTIONS = { app_settings: 'key', ai_prompts: 'promptId', ...(args.includes('--questions') ? { assessment_questions: 'questionId' } : {}) }

async function base (name) {
  const t = targets[name]
  const token = await generateAccessToken({ ...t.creds, scopes: t.creds.scopes })
  return libDb.init({ token: token.access_token, ow: { namespace: t.namespace }, region: 'amer' })
}

// CI deploys with an aio CLI that does not act on `database: auto-provision`, so a new workspace's database
// has to be requested once. --provision asks for it (only when it does not exist yet) and waits until it is ready.
async function ensureProvisioned (db, label) {
  let st = await db.provisionStatus()
  if (st.status === 'PROVISIONED') return
  if (!args.includes('--provision')) throw new Error(`the ${label} database is ${st.status}; run again with --provision to request it`)
  if (dry) { console.log(`  (dry run) would request the ${label} database`); return }
  if (st.status === 'NOT_PROVISIONED') { await db.provisionRequest(); console.log(`  requested the ${label} database`) }
  for (let i = 0; i < 40; i += 1) {
    st = await db.provisionStatus()
    if (st.status === 'PROVISIONED') { console.log(`  the ${label} database is ready`); return }
    if (/FAIL|ERROR/i.test(st.status)) throw new Error(`provisioning the ${label} database failed: ${st.message}`)
    await new Promise((r) => setTimeout(r, 6000))
  }
  throw new Error(`the ${label} database is still ${st.status}; run again in a few minutes`)
}

async function all (col) {
  try { return await col.find({}).limit(5000).toArray() } catch (e) { if (/not found|does not exist/i.test(e.message)) return []; throw e }
}

async function main () {
  console.log(`Stage ${targets.stage.namespace}  ->  Production ${targets.production.namespace}${dry ? '   (dry run)' : ''}`)
  const fromBase = await base('stage')
  const toBase = await base('production')
  await ensureProvisioned(toBase, 'Production')
  if (dry && (await toBase.provisionStatus()).status !== 'PROVISIONED') { console.log('\n--dry-run: Production has no database yet, so nothing more to compare.'); return }
  const from = await fromBase.connect()
  const to = await toBase.connect()
  try {
    for (const [name, idField] of Object.entries(COLLECTIONS)) {
      const source = await all(from.collection(name))
      const existing = new Map((await all(to.collection(name))).map((d) => [d[idField], d]))
      let added = 0; let replaced = 0; let kept = 0
      for (const doc of source) {
        const { _id, ...rest } = doc
        const id = rest[idField]
        if (!id) { console.log(`  ${name}: skipped a document with no ${idField}`); continue }
        const label = `${name}/${id}`
        if (existing.has(id)) {
          if (!overwrite) { kept += 1; console.log(`  keep     ${label} (already in Production)`); continue }
          if (!dry) await to.collection(name).updateOne({ [idField]: id }, { $set: rest })
          replaced += 1; console.log(`  replace  ${label}`)
        } else {
          if (!dry) await to.collection(name).insertOne(rest)
          added += 1; console.log(`  add      ${label}`)
        }
      }
      console.log(`${name}: ${source.length} in Stage, ${added} added, ${replaced} replaced, ${kept} left as they were`)
    }
  } finally {
    await from.close()
    await to.close()
  }
  console.log(dry ? '\n--dry-run: nothing was written.' : '\nDone.')
}

main().catch((e) => { console.error('copy failed:', e.message); process.exit(1) })
