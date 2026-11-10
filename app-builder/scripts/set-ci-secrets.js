#!/usr/bin/env node
// Loads the secrets the deploy workflows need into a GitHub Environment, from your local App Builder config.
// Values are piped to `gh secret set` and never printed.
//
//   node scripts/set-ci-secrets.js stage                      # from ./.env and ./.aio (your stage workspace)
//   node scripts/set-ci-secrets.js production --env-file .env.production --aio-file 157OchreTakin-20409-Production.json
//     (the workspace file supplies the credential and runtime values; .env.production only needs AI_KEY_PUBLIC and AI_KEY_PRIVATE)
//   add --dry-run to list what would be set without changing anything
//
// Needs the GitHub CLI signed in with permission to manage this repository's environments and secrets.
// The environment is created if it does not exist. Add required reviewers to "production" in the GitHub UI.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const args = process.argv.slice(2)
const envName = args.find((a) => !a.startsWith('--'))
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback }
const dry = args.includes('--dry-run')
if (!['stage', 'production'].includes(envName)) {
  console.error('usage: node scripts/set-ci-secrets.js <stage|production> [--env-file .env] [--aio-file .aio] [--dry-run]')
  process.exit(1)
}

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8')
const envVars = {}
try {
  read(opt('--env-file', '.env')).split('\n').forEach((l) => { const m = l.match(/^([^#=\s]+)=(.*)$/); if (m) envVars[m[1]] = m[2].replace(/^["']|["']$/g, '') })
} catch (e) { console.error(`cannot read the env file: ${e.message}`); process.exit(1) }
let aio = {}
try { aio = JSON.parse(read(opt('--aio-file', '.aio'))) } catch (e) { console.error(`cannot read the .aio / workspace file: ${e.message}`); process.exit(1) }

const project = aio.project || {}
const ws = project.workspace || {}
const ns = ((ws.details || {}).runtime || {}).namespaces || []
// "[a,b]" or '["a","b"]' (how the CLI stores lists) -> "a,b"
const list = (v) => { if (v === undefined) return undefined; try { const a = JSON.parse(v); return Array.isArray(a) ? a.join(',') : v } catch (e) { return v.replace(/^\[|\]$/g, '').replace(/"/g, '') } }

// the OAuth server-to-server credential saved by `aio app use`: AIO_ims_contexts_<name>_client__id ...
const ctx = Object.keys(envVars).map((k) => k.match(/^(AIO_ims_contexts_.+_)client__id$/)).find(Boolean)
const c = (suffix) => (ctx ? envVars[ctx[1] + suffix] : undefined)
// a downloaded workspace file carries the same credential: details.credentials[].oauth_server_to_server
const s2s = (((ws.details || {}).credentials || []).find((x) => x.oauth_server_to_server) || {}).oauth_server_to_server || {}
const join = (v) => (Array.isArray(v) ? v.join(',') : v)

const secrets = {
  CLIENTID: c('client__id') || s2s.client_id,
  CLIENTSECRET: list(c('client__secrets')) || join(s2s.client_secrets),
  TECHNICALACCOUNTID: c('technical__account__id') || s2s.technical_account_id,
  TECHNICALACCOUNTEMAIL: c('technical__account__email') || s2s.technical_account_email,
  IMSORGID: c('ims__org__id') || (project.org || {}).ims_org_id,
  SCOPES: list(c('scopes')) || join(s2s.scopes),
  AIO_RUNTIME_NAMESPACE: envVars.AIO_runtime_namespace || (ns[0] || {}).name,
  AIO_RUNTIME_AUTH: envVars.AIO_runtime_auth || (ns[0] || {}).auth,
  AIO_PROJECT_ID: project.id,
  AIO_PROJECT_NAME: project.name,
  AIO_PROJECT_ORG_ID: (project.org || {}).id,
  AIO_PROJECT_WORKSPACE_ID: ws.id,
  AIO_PROJECT_WORKSPACE_NAME: ws.name,
  AIO_PROJECT_WORKSPACE_DETAILS_SERVICES: (ws.details || {}).services ? JSON.stringify(ws.details.services) : undefined,
  ADMIN_IMS_CLIENT_SECRET: envVars.ADMIN_IMS_CLIENT_SECRET || (s2s.client_secrets || [])[0],
  ADMIN_IMS_SCOPES: envVars.ADMIN_IMS_SCOPES || list(c('scopes')) || join(s2s.scopes),
  AI_KEY_PUBLIC: envVars.AI_KEY_PUBLIC,
  AI_KEY_PRIVATE: envVars.AI_KEY_PRIVATE
}

const missing = Object.entries(secrets).filter(([, v]) => v === undefined || v === '').map(([k]) => k)
const present = Object.keys(secrets).filter((k) => !missing.includes(k))
console.log(`Environment "${envName}": ${present.length} secrets found, ${missing.length} missing`)
present.forEach((k) => console.log(`  ok       ${k}`))
missing.forEach((k) => console.log(`  MISSING  ${k}`))
if (dry) { console.log('\n--dry-run: nothing was changed.'); process.exit(0) }
if (missing.length) { console.error('\nNothing was set. Add the missing values to the env file (or the workspace file) and run again.'); process.exit(1) }

const gh = (a, input) => spawnSync('gh', a, { input, encoding: 'utf8' })
const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'])
if (repo.status !== 0) { console.error('gh could not find the repository:', repo.stderr.trim()); process.exit(1) }
const slug = repo.stdout.trim()
const made = gh(['api', '-X', 'PUT', `repos/${slug}/environments/${envName}`, '--silent'])
if (made.status !== 0) { console.error('could not create the environment:', made.stderr.trim()); process.exit(1) }
for (const [k, v] of Object.entries(secrets)) {
  const r = gh(['secret', 'set', k, '--env', envName, '--repo', slug], v)
  if (r.status !== 0) { console.error(`failed to set ${k}:`, r.stderr.trim()); process.exit(1) }
  console.log(`  set      ${k}`)
}
console.log(`\nDone: ${present.length} secrets set on ${slug} (environment "${envName}").`)
