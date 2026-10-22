const assessments = require('../assessments/schema')
const responses = require('../guided-discovery/schema')
const { withDb, isNotFound, findOneOrNull, ensureIndexes } = require('../lib/db')
const questions = require('../lib/questions')

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
//        &assessment=self-guided filters either dataset
//   POST {op:'delete', dataset, id} -> { ok, deleted: 1 } permanently removes one record (404 if absent)
//   POST {op:'delete', dataset, ids:[...]} -> { ok, deleted, notFound } removes up to 100 records
//        (legacy body {op:'delete', submissionId} deletes from assessments)
//   GET ?dataset=questions&assessment=self-guided -> { ok, items } the question bank, in page order
//   GET ?dataset=profile-answers&submissionId=... -> { ok, runs } every response linked to that profile,
//        each laid out against the whole question bank (answered or not), newest first
//   POST {op:'question-save', assessment, question:{questionId, section, sectionTitle, title, help,
//         type, required, options:[{key, label}]}, editor?} -> { ok, question, created }
//        creates a question, or updates one with question.update:true; keys are fixed once saved
//        (see lib/questions.js)
async function main (params) {
  if (params.op === 'question-save' || params.dataset === 'questions') return questionBank(params)
  if (params.dataset === 'profile-answers') return profileAnswers(params)
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

// The question bank: list in page order, or create/update one question.
async function questionBank (params) {
  const assessment = params.assessment || assessments.DEFAULT_ASSESSMENT
  if (!assessments.ASSESSMENT_IDS.includes(assessment)) return reply(400, { ok: false, error: 'invalid assessment' })
  const method = (params.__ow_method || 'get').toLowerCase()
  try {
    return await withDb(params, async (client) => {
      const col = client.collection(questions.COLLECTION)
      await ensureIndexes(col, questions.INDEXES)
      if (method === 'get') {
        const items = await col.find({ assessment }).limit(1000).toArray()
        items.sort((a, b) => (a.sectionOrder - b.sectionOrder) || (a.order - b.order))
        return reply(200, { ok: true, dataset: 'questions', total: items.length, count: items.length, items })
      }
      if (method !== 'post' || params.op !== 'question-save') return reply(400, { ok: false, error: 'op must be question-save' })
      return saveQuestion(col, assessment, params)
    })
  } catch (e) {
    console.error('assessments-admin questions failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

// The answers behind one profile: its linked responses, each as a full question-by-question sheet.
async function profileAnswers (params) {
  if (!UUID_RE.test(params.submissionId || '')) return reply(400, { ok: false, error: 'invalid submissionId' })
  try {
    return await withDb(params, async (client) => {
      const runs = await client.collection(responses.COLLECTION)
        .find({ submissionId: params.submissionId }).limit(50).toArray()
      runs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      const banks = new Map()
      const out = []
      for (const r of runs) {
        if (!banks.has(r.assessment)) banks.set(r.assessment, await questions.sectionsOf(client, r.assessment))
        out.push({
          responseId: r.responseId,
          assessment: r.assessment,
          status: r.status,
          progress: r.progress || { completed: [] },
          result: r.result || null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          completedAt: r.completedAt || null,
          sections: questions.answerSheet(banks.get(r.assessment), r.sections)
        })
      }
      return reply(200, { ok: true, submissionId: params.submissionId, count: out.length, runs: out })
    })
  } catch (e) {
    console.error('assessments-admin profile-answers failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

// Who saved it, for the record: the editor's email from the Shell profile, else the token's user id.
function editorOf (params) {
  const email = String(params.editor || '').trim().slice(0, 200)
  if (email) return email
  try {
    const auth = String(((params.__ow_headers || {}).authorization) || '')
    const payload = JSON.parse(Buffer.from(auth.split('.')[1] || '', 'base64url').toString('utf8'))
    return String(payload.user_id || '')
  } catch (e) {
    return ''
  }
}

async function saveQuestion (col, assessment, params) {
  const input = params.question || {}
  const key = String(input.questionId || '').trim()
  const existing = key ? await findOneOrNull(col, { assessment, questionId: key }) : null
  // updates must name a saved question, and a new question can't reuse a saved key
  if (input.update === true && !existing) return reply(404, { ok: false, errors: { questionId: 'not found' } })
  if (input.update !== true && existing) return reply(400, { ok: false, errors: { questionId: 'this key is already used' } })
  const now = new Date().toISOString()
  const { doc, errors } = questions.validateEdit(input, existing, now, editorOf(params))

  // a new question goes last in its section; a new section goes after the others
  let placement = {}
  if (!existing && !Object.keys(errors).length) {
    const all = await col.find({ assessment }).limit(1000).toArray()
    const inSection = all.filter((q) => q.section === doc.section)
    if (inSection.length) {
      placement = {
        sectionOrder: inSection[0].sectionOrder,
        sectionTitle: doc.sectionTitle || inSection[0].sectionTitle,
        order: Math.max(...inSection.map((q) => q.order)) + 1
      }
    } else {
      if (!doc.sectionTitle) errors.sectionTitle = 'required for a new section'
      placement = { sectionOrder: all.length ? Math.max(...all.map((q) => q.sectionOrder)) + 1 : 0, order: 0 }
    }
  }
  if (Object.keys(errors).length) return reply(400, { ok: false, errors })

  if (existing) {
    await col.updateOne({ assessment, questionId: key }, { $set: doc })
  } else {
    await col.insertOne({ assessment, ...doc, ...placement })
  }
  questions.forget(assessment)
  const saved = await findOneOrNull(col, { assessment, questionId: doc.questionId })
  console.log('assessments-admin', existing ? 'updated' : 'created', 'question', assessment, doc.questionId)
  return reply(existing ? 200 : 201, { ok: true, created: !existing, question: saved })
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
