/* eslint-disable no-console */
// Seeds the question bank (collection assessment_questions) from the published DA structured
// content: every question of every section listed in the assessment's summary document, in page
// order, with all its fields (options, choices, capabilities, display settings). Questions that
// are already in the bank are skipped, so edits made in the admin viewer are never overwritten.
//
//   node scripts/seed-questions.js              # dry run
//   node scripts/seed-questions.js --write      # insert missing questions
//
// Uses the ADMIN_IMS_* and AIO_runtime_* values in app-builder/.env.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

process.env.__OW_NAMESPACE = process.env.__OW_NAMESPACE || process.env.AIO_runtime_namespace
process.env.__OW_API_KEY = process.env.__OW_API_KEY || process.env.AIO_runtime_auth
const { withDb, findOneOrNull, ensureIndexes } = require('../actions/lib/db')
const questions = require('../actions/lib/questions')

const write = process.argv.includes('--write')
const ASSESSMENT = 'self-guided'
const BASE = 'https://da-sc.adobeaem.workers.dev/live/adobedevxsc/guided-discovery/forms/guided-discovery'
const env = process.env

async function fetchDoc (id) {
  const res = await fetch(`${BASE}/${id}`)
  if (!res.ok) throw new Error(`${id}: ${res.status}`)
  return (await res.json()).data
}

withDb({
  clientId: env.ADMIN_IMS_CLIENT_ID, clientSecret: env.ADMIN_IMS_CLIENT_SECRET, orgId: env.ADMIN_IMS_ORG_ID, scopes: env.ADMIN_IMS_SCOPES
}, async (client) => {
  const col = client.collection(questions.COLLECTION)
  await ensureIndexes(col, questions.INDEXES)
  const summary = await fetchDoc('summary')
  const now = new Date().toISOString()
  let added = 0
  let skipped = 0
  for (const [sectionOrder, sectionId] of summary.sections.entries()) {
    const section = await fetchDoc(sectionId)
    for (const [order, q] of section.questions.entries()) {
      const { id, ...fields } = q
      if (await findOneOrNull(col, { assessment: ASSESSMENT, questionId: id })) { skipped += 1; continue }
      const doc = {
        assessment: ASSESSMENT,
        questionId: id,
        section: sectionId,
        sectionTitle: section.eyebrow || sectionId,
        sectionOrder,
        order,
        ...fields,
        createdAt: now,
        updatedAt: now,
        updatedBy: 'seed from DA'
      }
      console.log(write ? 'add' : 'would add', `${sectionId}.${id}`, `[${q.display}]`, `${(q.options || []).length} options`)
      if (write) { await col.insertOne(doc); added += 1 }
    }
  }
  console.log(`${write ? `added ${added}` : 'dry run'}; skipped ${skipped} already in ${questions.COLLECTION}`)
}).catch((e) => { console.error(e.message); process.exit(1) })
