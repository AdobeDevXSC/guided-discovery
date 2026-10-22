const crypto = require('crypto')
const { computeSummary } = require('../../../blocks/gd-summary/scoring.js')
const {
  COLLECTION, SCHEMA_VERSION, INDEXES,
  leadRefId, cleanSource, validateProgress, sectionIdOf, validateStructured
} = require('./schema')
const assessments = require('../assessments/schema')
const { withCors } = require('../lib/cors')
const { withDb, findOneOrNull, ensureIndexes } = require('../lib/db')
const questions = require('../lib/questions')

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const reply = (statusCode, body) => ({ statusCode, headers, body })
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const hasErrors = (errors) => Object.keys(errors).length > 0

// Questions come from the question bank (collection assessment_questions, edited in the admin
// viewer). Each assessment's summary document (scoring thresholds, capability copy) is still
// authored in DA structured content and read through the delivery service.
const SC_BASE = 'https://da-sc.adobeaem.workers.dev'
const CONTENT = {
  'self-guided': 'adobedevxsc/guided-discovery/forms/guided-discovery'
}

// Published documents are cached per warm container; preview vs live follows the visitor's page.
const SC_TTL_MS = 60 * 1000
const scCache = new Map()
async function structuredDoc (assessment, id, env) {
  const which = env === 'preview' ? 'preview' : 'live'
  const cacheKey = `${which}/${assessment}/${id}`
  const hit = scCache.get(cacheKey)
  if (hit && Date.now() - hit.at < SC_TTL_MS) return hit.doc
  try {
    const res = await fetch(`${SC_BASE}/${which}/${CONTENT[assessment]}/${id}`)
    if (res.status === 404) return { missing: true }
    if (!res.ok) return null
    const json = await res.json()
    const data = json && json.data ? json.data : null
    // a short fingerprint of the exact published version the answers were checked against
    const hash = data ? crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16) : null
    const doc = data ? { data, hash } : null
    scCache.set(cacheKey, { at: Date.now(), doc })
    return doc
  } catch (e) {
    return null // delivery unreachable: fall back to shape-only validation
  }
}

// The recommendation, scored from the DA summary document and the bank's questions (same module as
// the gd-summary block). Returns null when the summary can't be fetched right now.
async function scoredResult (client, assessment, sections, env) {
  const summary = await structuredDoc(assessment, 'summary', env)
  if (!summary || summary.missing) return null
  const bank = await questions.sectionsOf(client, assessment)
  const ids = Array.isArray(summary.data.sections) ? summary.data.sections : []
  const docs = Object.fromEntries(ids.map((id) => [id, bank.has(id) ? bank.get(id).data : {}]))
  return computeSummary(summary.data, docs, sections || {})
}

// The bank's version of one section, or { missing: true } if it has no questions.
async function sectionContent (client, assessment, sectionId) {
  const bank = await questions.sectionsOf(client, assessment)
  return bank.get(sectionId) || { missing: true }
}

// The browser's tab-close save is sent as text/plain (a CORS-safelisted type, so no preflight);
// the web action then receives the raw body in __ow_body instead of merged params.
function readBody (params) {
  if (params.op || typeof params.__ow_body !== 'string') return params
  for (const decode of [(b) => b, (b) => Buffer.from(b, 'base64').toString('utf8')]) {
    try {
      const parsed = JSON.parse(decode(params.__ow_body))
      if (parsed && typeof parsed === 'object') return { ...params, ...parsed }
    } catch (e) { /* try next decoding */ }
  }
  return params
}

// Public endpoint for assessment responses (collection assessment_responses). A response is
// token-gated by its random responseId, which the browser keeps to autosave and resume.
//   POST {op:'start', assessment?, leadRef?, source, contentVersion} -> 201 {responseId, linked}
//   POST {op:'link', responseId, leadRef}                    -> 200 {linked} (only if not yet linked)
//   POST {op:'save', responseId, section, rev, data, progress?} -> 200 {rev, savedAt}; 409 if rev is stale
//   POST {op:'save', responseId, progress}                   -> 200 (progress only)
//   POST {op:'answer', responseId, userId?, section, question, value, contentEnv?}
//        -> 200 {userId, saved, revs, savedAt}; 403 if the response isn't linked to a user
//   POST {op:'answer', responseId, userId?, answers:[{section, question, value}, ...]} (up to 50, all or nothing)
//        Each answer replaces that one question; the section's other answers are kept. value is a
//        string or an array of strings; null or [] clears the question. Only responses with a userId
//        (started with leadRef, or linked) take answers; userId, if sent, must be theirs (else 404)
//   POST {op:'complete', responseId, contentEnv?}            -> 200 {result}; 503 if content is unreachable
//   GET  ?responseId=...                                     -> 200 {response}
//   GET  ?op=questions&assessment=self-guided                -> 200 {sections:[{section, title, questions}]}
//   GET  ?op=answers&userId=...&responseId=...&assessment=?  -> 200 {userId, responses:[...]} every run of
//        that person, answers labelled with the question text; responseId must be one of their own
//        responses (the secret), otherwise 404
// Clients from before the rename send sessionId (and read sessionId / session back); both are
// accepted and answered, and "sc-<sectionId>" section keys are accepted as <sectionId>.
async function handle (raw) {
  const params = readBody(raw)
  const method = (params.__ow_method || 'get').toLowerCase()
  // honeypot: real users never fill this hidden field
  if (params.website) return reply(200, { ok: true })
  if (method !== 'get' && method !== 'post') return reply(405, { ok: false, error: 'method not allowed' })
  if (method === 'post' && !['start', 'save', 'answer', 'complete', 'link'].includes(params.op)) {
    return reply(400, { ok: false, error: 'op must be start, save, answer, link or complete' })
  }
  if (method === 'get' && params.op === 'questions') return listQuestions(params)
  if (method === 'get' && params.op === 'answers') return listAnswers(params)
  const responseId = params.responseId || params.sessionId
  if ((method === 'get' || params.op !== 'start') && !UUID_RE.test(responseId || '')) {
    return reply(400, { ok: false, error: 'invalid responseId' })
  }

  try {
    return await withDb(params, async (client) => {
      const col = client.collection(COLLECTION)
      await ensureIndexes(col, INDEXES)
      if (method === 'get') return resume(col, responseId)
      if (params.op === 'start') return start(client, col, params)
      if (params.op === 'save') return save(client, col, responseId, params)
      if (params.op === 'link') return link(client, col, responseId, params)
      if (params.op === 'answer') return answer(client, col, responseId, params)
      return complete(client, col, responseId, params)
    })
  } catch (e) {
    console.error('guided-discovery failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

// Every question of an assessment: text, keys, answer type and options, for front ends that show
// the questions themselves. Public: the bank holds no personal data.
async function listQuestions (params) {
  const assessment = params.assessment || assessments.DEFAULT_ASSESSMENT
  if (!CONTENT[assessment]) return reply(400, { ok: false, error: 'unknown assessment' })
  try {
    return await withDb(params, async (client) => {
      const bank = await questions.sectionsOf(client, assessment)
      return reply(200, { ok: true, assessment, sections: questions.publicSections(bank) })
    })
  } catch (e) {
    console.error('guided-discovery questions failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

// One stored value with its labels: option keys, "item:choice", "option=owner" and free text.
function labelValue (q, value, questionsOfSection) {
  const label = (list, id) => ((list || []).find((o) => o.id === id) || {}).label || id
  if (!q) return { value }
  if (q.display === 'text') return { value, label: value }
  const owner = /^([a-z0-9][a-z0-9-]*)=(.*)$/.exec(value)
  if (owner) return { value, option: owner[1], optionLabel: label(q.options, owner[1]), text: owner[2] }
  const pair = /^([a-z0-9][a-z0-9-]*):([a-z0-9][a-z0-9-]*)$/.exec(value)
  if (pair) {
    // per-item answers are about the options of the itemsFrom question
    const items = q.itemsFrom ? ((questionsOfSection.find((x) => x.id === q.itemsFrom) || {}).options) : q.options
    if (pair[2] === 'follow-up') return { value, option: pair[1], optionLabel: label(items, pair[1]), followUp: true }
    return { value, option: pair[1], optionLabel: label(items, pair[1]), choice: pair[2], choiceLabel: label(q.choices, pair[2]) }
  }
  return { value, label: label(q.options, value) }
}

// Every response of one person, with each answer labelled from the question bank. The caller must
// hold one of that person's responseIds (the resume token kept by the browser that answered), so a
// userId alone, which is not secret, reads nothing. Other runs' responseIds are not returned: they
// are write tokens.
async function listAnswers (params) {
  const { userId, responseId } = params
  if (!UUID_RE.test(userId || '') || !UUID_RE.test(responseId || '')) {
    return reply(400, { ok: false, error: 'userId and responseId are required' })
  }
  if (params.assessment && !CONTENT[params.assessment]) return reply(400, { ok: false, error: 'unknown assessment' })
  try {
    return await withDb(params, async (client) => {
      const col = client.collection(COLLECTION)
      const proof = await findOneOrNull(col, { responseId })
      if (!proof || proof.userId !== userId) return reply(404, { ok: false, error: 'not found' })
      const filter = { userId, ...(params.assessment ? { assessment: params.assessment } : {}) }
      const docs = await col.find(filter).limit(100).toArray()
      docs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      const banks = new Map()
      const responses = []
      for (const d of docs) {
        if (!banks.has(d.assessment)) banks.set(d.assessment, await questions.sectionsOf(client, d.assessment))
        const bank = banks.get(d.assessment)
        const sections = Object.entries(d.sections || {}).map(([sectionId, entry]) => {
          const qs = bank.has(sectionId) ? bank.get(sectionId).data.questions : []
          return {
            section: sectionId,
            title: bank.has(sectionId) ? bank.get(sectionId).data.eyebrow || sectionId : sectionId,
            savedAt: entry.savedAt,
            answers: Object.entries(entry.answers || {}).map(([qid, values]) => {
              const q = qs.find((x) => x.id === qid)
              return {
                question: qid,
                text: q ? q.title || '' : '',
                values: (values || []).map((v) => labelValue(q, v, qs))
              }
            })
          }
        })
        responses.push({
          ...(d.responseId === responseId ? { responseId } : {}),
          assessment: d.assessment,
          submissionId: d.submissionId || null,
          status: d.status,
          progress: d.progress || { completed: [] },
          sections,
          result: d.result || null,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          completedAt: d.completedAt || null
        })
      }
      return reply(200, { ok: true, userId, count: responses.length, responses })
    })
  } catch (e) {
    console.error('guided-discovery answers failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

// The profile behind a ?lead= hand-off, only if that submission exists (and for this assessment).
async function verifiedLead (client, input, assessment) {
  const submissionId = leadRefId(input)
  if (!submissionId) return null
  const found = await findOneOrNull(client.collection(assessments.COLLECTION), { submissionId })
  if (!found || (found.assessment && found.assessment !== assessment)) return null
  return { submissionId, userId: found.userId || null }
}

async function start (client, col, params) {
  const assessment = params.assessment || assessments.DEFAULT_ASSESSMENT
  if (!CONTENT[assessment]) return reply(400, { ok: false, errors: { assessment: 'unknown assessment' } })
  const lead = await verifiedLead(client, params.leadRef, assessment)
  const now = new Date().toISOString()
  const responseId = crypto.randomUUID()
  await col.insertOne({
    responseId,
    schemaVersion: SCHEMA_VERSION,
    assessment,
    userId: lead ? lead.userId : null,
    submissionId: lead ? lead.submissionId : null,
    status: 'started',
    contentVersion: String(params.contentVersion || '').slice(0, 40),
    contentEnv: params.contentEnv === 'preview' ? 'preview' : 'live',
    source: cleanSource(params.source),
    sections: {},
    progress: { completed: [] },
    result: null,
    client: { userAgent: String((params.__ow_headers || {})['user-agent'] || '').slice(0, 300) },
    createdAt: now,
    updatedAt: now,
    completedAt: null
  })
  return reply(201, { ok: true, responseId, sessionId: responseId, linked: Boolean(lead) })
}

async function link (client, col, responseId, params) {
  const doc = await findOneOrNull(col, { responseId })
  if (!doc) return reply(404, { ok: false, error: 'not found' })
  if (doc.submissionId) return reply(200, { ok: true, linked: true, changed: false })
  const lead = await verifiedLead(client, params.leadRef, doc.assessment)
  if (!lead) return reply(200, { ok: true, linked: false })
  await col.updateOne({ responseId }, { $set: { ...lead, updatedAt: new Date().toISOString() } })
  return reply(200, { ok: true, linked: true, changed: true })
}

async function save (client, col, responseId, params) {
  const hasSection = params.section !== undefined
  if (!hasSection && params.progress === undefined) {
    return reply(400, { ok: false, error: 'section or progress required' })
  }
  const sectionId = hasSection ? sectionIdOf(params.section) : null
  if (hasSection && !sectionId) return reply(400, { ok: false, errors: { section: 'unknown section' } })
  const rev = Number(params.rev)
  if (hasSection && !(Number.isInteger(rev) && rev >= 1)) {
    return reply(400, { ok: false, error: 'rev must be a positive integer' })
  }
  const doc = await findOneOrNull(col, { responseId })
  if (!doc) return reply(404, { ok: false, error: 'not found' })

  const errors = {}
  let entry
  if (hasSection) {
    const content = await sectionContent(client, doc.assessment, sectionId)
    if (content.missing) return reply(400, { ok: false, errors: { section: 'unknown section' } })
    const v = validateStructured(sectionId, params.data, content.data)
    Object.assign(errors, v.errors)
    entry = { answers: v.data.answers, rev, contentHash: content.hash }
  }
  const p = validateProgress(params.progress)
  Object.assign(errors, p.errors)
  if (hasErrors(errors)) return reply(400, { ok: false, errors })

  const now = new Date().toISOString()
  const set = { updatedAt: now }
  if (hasSection) {
    const stored = ((doc.sections || {})[sectionId] || {}).rev || 0
    if (rev <= stored) return reply(409, { ok: false, error: 'stale revision', rev: stored })
    entry.savedAt = now
    set[`sections.${sectionId}`] = entry
  }
  if (p.progress) set.progress = { ...(doc.progress || {}), ...p.progress }
  if (doc.status === 'completed') {
    // edits after completion keep the server-side recommendation current
    const sections = hasSection ? { ...(doc.sections || {}), [sectionId]: entry } : doc.sections
    const result = await scoredResult(client, doc.assessment, sections, params.contentEnv)
    if (result) set.result = { ...result, computedAt: now }
  } else {
    set.status = 'in_progress'
  }
  await col.updateOne({ responseId }, { $set: set })
  return reply(200, { ok: true, ...(hasSection ? { rev } : {}), savedAt: now })
}

const MAX_ANSWERS = 50
const QUESTION_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

// answer only stores answers it can attribute to a person: the response must carry a userId (it
// was started with leadRef, or linked). An optional userId must be that person's; a different one
// reads as not found, so it doesn't reveal whose response it is. Returns null when allowed.
function answerOwnerError (doc, params) {
  const given = params.userId !== undefined && params.userId !== null
  if (given && !UUID_RE.test(String(params.userId))) return reply(400, { ok: false, error: 'invalid userId' })
  if (!doc.userId) {
    return reply(403, {
      ok: false,
      error: 'response is not linked to a user',
      hint: 'start the response with leadRef, or link it with op "link", first'
    })
  }
  if (given && params.userId !== doc.userId) return reply(404, { ok: false, error: 'not found' })
  return null
}

// Answers to individual questions, for callers that post as they go (one question or a batch)
// instead of saving whole sections. Every answer is checked first; nothing is stored on error.
async function answer (client, col, responseId, params) {
  const list = params.answers !== undefined
    ? params.answers
    : [{ section: params.section, question: params.question, value: params.value }]
  if (!Array.isArray(list) || !list.length || list.length > MAX_ANSWERS) {
    return reply(400, { ok: false, error: `answers must list 1 to ${MAX_ANSWERS} answers` })
  }
  const errors = {}
  const bySection = new Map() // sectionId -> { questionId: [values] }
  list.forEach((a, i) => {
    const sectionId = a && sectionIdOf(a.section)
    if (!sectionId) { errors[`answers.${i}.section`] = 'unknown section'; return }
    if (!QUESTION_ID_RE.test((a && a.question) || '')) { errors[`answers.${i}.question`] = 'invalid question id'; return }
    const v = a.value
    const values = v === null || v === undefined ? [] : (Array.isArray(v) ? v : [v])
    if (!bySection.has(sectionId)) bySection.set(sectionId, {})
    bySection.get(sectionId)[a.question] = values
  })
  if (hasErrors(errors)) return reply(400, { ok: false, errors })

  const doc = await findOneOrNull(col, { responseId })
  if (!doc) return reply(404, { ok: false, error: 'not found' })
  const denied = answerOwnerError(doc, params)
  if (denied) return denied

  const now = new Date().toISOString()
  const set = { updatedAt: now }
  const sections = { ...(doc.sections || {}) }
  const revs = {}
  for (const [sectionId, patch] of bySection) {
    const content = await sectionContent(client, doc.assessment, sectionId)
    if (content.missing) { errors[sectionId] = 'unknown section'; continue }
    const current = (sections[sectionId] || {}).answers || {}
    // validate the section as it will be stored, so per-item answers are checked against their items
    const merged = { ...current }
    Object.entries(patch).forEach(([qid, values]) => {
      if (values.length) merged[qid] = values
      else delete merged[qid]
    })
    const v = validateStructured(sectionId, { answers: merged }, content.data)
    if (hasErrors(v.errors)) { Object.assign(errors, v.errors); continue }
    const rev = ((sections[sectionId] || {}).rev || 0) + 1
    const entry = { answers: v.data.answers, rev, savedAt: now, contentHash: content.hash }
    sections[sectionId] = entry
    set[`sections.${sectionId}`] = entry
    revs[sectionId] = rev
  }
  if (hasErrors(errors)) return reply(400, { ok: false, errors })

  if (doc.status === 'completed') {
    const result = await scoredResult(client, doc.assessment, sections, params.contentEnv)
    if (result) set.result = { ...result, computedAt: now }
  } else {
    set.status = 'in_progress'
  }
  await col.updateOne({ responseId }, { $set: set })
  const saved = [...bySection].flatMap(([section, patch]) => Object.keys(patch).map((question) => ({ section, question })))
  return reply(200, { ok: true, userId: doc.userId, saved, revs, savedAt: now })
}

async function complete (client, col, responseId, params) {
  const doc = await findOneOrNull(col, { responseId })
  if (!doc) return reply(404, { ok: false, error: 'not found' })
  const now = new Date().toISOString()
  const scored = await scoredResult(client, doc.assessment, doc.sections, params.contentEnv)
  if (!scored) return reply(503, { ok: false, error: 'content unavailable, try again' })
  const result = { ...scored, computedAt: now }
  await col.updateOne(
    { responseId },
    { $set: { status: 'completed', result, completedAt: doc.completedAt || now, updatedAt: now } }
  )
  return reply(200, { ok: true, result })
}

// What the browser needs to resume: answers and revisions per section, progress and the result.
// No profile data is returned (the response only references it).
async function resume (col, responseId) {
  const doc = await findOneOrNull(col, { responseId })
  if (!doc) return reply(404, { ok: false, error: 'not found' })
  const sections = Object.fromEntries(Object.entries(doc.sections || {}).map(([id, s]) => [id, { answers: s.answers || {} }]))
  const revs = Object.fromEntries(Object.entries(doc.sections || {}).map(([id, s]) => [id, s.rev || 0]))
  const response = {
    responseId: doc.responseId,
    assessment: doc.assessment,
    status: doc.status,
    contentVersion: doc.contentVersion,
    linked: Boolean(doc.submissionId),
    leadSubmissionId: doc.submissionId || null,
    sections,
    revs,
    progress: doc.progress || { completed: [] },
    result: doc.result,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    completedAt: doc.completedAt
  }
  // the pre-rename client reads `session`, keyed by "sc-<sectionId>"
  const legacy = (o) => Object.fromEntries(Object.entries(o).map(([id, v]) => [`sc-${id}`, v]))
  const session = {
    ...response, sessionId: doc.responseId, sections: legacy(sections), revs: legacy(revs)
  }
  return reply(200, { ok: true, response, session })
}

exports.main = withCors(handle)
