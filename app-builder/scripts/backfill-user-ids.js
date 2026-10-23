/* eslint-disable no-console */
// Gives profiles saved before userId existed their person's userId, and copies it onto the
// responses linked to them. Same rule as the assessments API: one userId per lowercased email in
// cja_users (an existing one is reused, otherwise one is created). Only missing userId fields are
// written; nothing else changes.
//
//   node scripts/backfill-user-ids.js            # dry run: report what would change
//   node scripts/backfill-user-ids.js --write    # write
//
// Uses the ADMIN_IMS_* and AIO_runtime_* values in app-builder/.env.
const crypto = require('crypto')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

process.env.__OW_NAMESPACE = process.env.__OW_NAMESPACE || process.env.AIO_runtime_namespace
process.env.__OW_API_KEY = process.env.__OW_API_KEY || process.env.AIO_runtime_auth
const { withDb, findOneOrNull } = require('../actions/lib/db')
const assessments = require('../actions/assessments/schema')
const responses = require('../actions/guided-discovery/schema')

const write = process.argv.includes('--write')
const env = process.env

withDb({
  clientId: env.ADMIN_IMS_CLIENT_ID, clientSecret: env.ADMIN_IMS_CLIENT_SECRET, orgId: env.ADMIN_IMS_ORG_ID, scopes: env.ADMIN_IMS_SCOPES
}, async (client) => {
  const profiles = client.collection(assessments.COLLECTION)
  const users = client.collection(assessments.USERS_COLLECTION)
  const runs = client.collection(responses.COLLECTION)
  const now = new Date().toISOString()

  // 1. profiles without a userId
  const all = await (await profiles.find({})).toArray()
  const missing = all.filter((p) => !p.userId)
  const created = new Map() // email -> userId made in this run (dry run included)
  let profilesSet = 0
  let usersCreated = 0
  let skipped = 0
  for (const p of missing) {
    const email = String((p.profile || {}).email || '').trim().toLowerCase()
    if (!email) { skipped += 1; console.log('skip (no email)', p.submissionId); continue }
    let userId = created.get(email)
    let isNew = false
    if (!userId) {
      const existing = await findOneOrNull(users, { email })
      if (existing) userId = existing.userId
      else { userId = crypto.randomUUID(); isNew = true }
      created.set(email, userId)
    }
    console.log(write ? 'set' : 'would set', 'profile', p.submissionId, email, '->', userId, isNew ? '(new user)' : '(existing user)')
    if (write) {
      if (isNew) await users.insertOne({ userId, email, createdAt: now, backfilled: true })
      await profiles.updateOne({ submissionId: p.submissionId }, { $set: { userId } })
    }
    if (isNew) usersCreated += 1
    profilesSet += 1
  }

  // 2. linked responses without a userId: copy it from their profile
  const userOf = new Map(all.map((p) => [p.submissionId, p.userId]))
  for (const p of missing) {
    const email = String((p.profile || {}).email || '').trim().toLowerCase()
    if (email && created.has(email)) userOf.set(p.submissionId, created.get(email))
  }
  const orphans = (await (await runs.find({ submissionId: { $ne: null } })).toArray()).filter((r) => r.submissionId && !r.userId)
  let runsSet = 0
  let runsNoProfile = 0
  for (const r of orphans) {
    const userId = userOf.get(r.submissionId)
    if (!userId) { runsNoProfile += 1; console.log('skip response (profile not found)', r.responseId); continue }
    console.log(write ? 'set' : 'would set', 'response', r.responseId, '->', userId)
    if (write) await runs.updateOne({ responseId: r.responseId }, { $set: { userId } })
    runsSet += 1
  }

  console.log(`${write ? 'done' : 'dry run'}: ${all.length} profiles, ${missing.length} without userId -> ${profilesSet} set` +
    ` (${usersCreated} new users), ${skipped} skipped; ${orphans.length} linked responses without userId -> ${runsSet} set,` +
    ` ${runsNoProfile} skipped`)
}).catch((e) => { console.error(e.message); process.exit(1) })
