const crypto = require('crypto')
const assessments = require('../assessments/schema')
const responses = require('../guided-discovery/schema')
const { withDb, isNotFound, findOneOrNull, ensureIndexes } = require('../lib/db')
const questions = require('../lib/questions')
const { labelResult } = require('../lib/result')
const settings = require('../lib/settings')
const ai = require('../lib/ai')

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
//        profiles (dataset=assessments) carry `run`: their latest linked response's
//        { responseId, status, answered, totalQuestions, completedSections, totalSections, updatedAt },
//        or null if none (answered = bank questions with at least one value)
//   POST {op:'delete', dataset, id} -> { ok, deleted: 1 } permanently removes one record (404 if absent)
//   POST {op:'delete', dataset, ids:[...]} -> { ok, deleted, notFound } removes up to 100 records
//        (legacy body {op:'delete', submissionId} deletes from assessments)
//   GET ?dataset=questions&assessment=self-guided -> { ok, items } the question bank, in page order
//   GET ?dataset=profile-answers&submissionId=... -> { ok, submission, runs } the initial form (profile,
//        consent, source; null if the profile is gone) and every response linked to that profile,
//        each laid out against the whole question bank (answered or not), newest first
//   GET ?dataset=settings -> { ok, ai: {provider, hasKey, keyHint, updatedAt, updatedBy}, prompts }
//        the API key is never returned, only whether one is saved and its last 4 characters
//   POST {op:'settings-save', ai:{apiKey} | {clearKey:true}, editor?} -> { ok, ai }
//        stores the key encrypted with the public key; this action cannot decrypt it
//   POST {op:'skill-save', skill:{name, text}, editor?} -> { ok, skill } the wrap-up skill (system prompt for
//        the guide generated when a user finishes the assessment); GET settings returns it as `skill`
//   GET ?dataset=llm-log &status= &trigger=manual|wrapup &limit= &skip= -> { ok, total, items } every LLM query,
//        newest first, without the long input/output; &analysisId=... -> { ok, entry } one in full
//   GET ?dataset=ai-analyses&responseId=... -> { ok, analyses } AI replies for one response, newest first
//   POST {op:'ai-send', responseId, promptId, editor?} -> 201 { ok, analysis } sends a completed
//        response (full question text and answers, no contact details) with a stored prompt to
//        Claude in the background (action ai-analysis); poll the list until status is done/failed
//   POST {op:'prompt-save', prompt:{promptId?, name, text}, editor?} -> { ok, prompt, created }
//   POST {op:'prompt-delete', promptId} -> { ok, deleted }
//   POST {op:'llm-rerun', analysisId, editor?} -> 201 { ok, analysis } sends that query again as a new entry (a wrap-up uses the
//        skill as saved now); 409 while a query for the same assessment is running
//   POST {op:'llm-delete', analysisId} -> { ok, deleted } removes one LLM log entry (wrap-up or admin query), by id only;
//        409 while it is queued or running. Deleting a wrap-up lets that response be wrapped up again.
//   GET ?dataset=answers-export&assessment=self-guided -> { ok, columns, rows } for the CSV export:
//        columns = every bank question in page order; rows = { submissionId: latest run's status,
//        result and answers as text } for every profile with a linked response
//   POST {op:'question-save', assessment, question:{questionId, section, sectionTitle, title, help,
//         type, required, options:[{key, label}]}, editor?} -> { ok, question, created }
//        creates a question, or updates one with question.update:true; keys are fixed once saved
//        (see lib/questions.js)
async function main (params) {
  if (params.op === 'question-save' || params.dataset === 'questions') return questionBank(params)
  if (params.dataset === 'profile-answers') return profileAnswers(params)
  if (params.dataset === 'ai-analyses' || params.op === 'ai-send') return aiAnalyses(params)
  if (params.dataset === 'answers-export') return answersExport(params)
  if (params.dataset === 'llm-log') return llmLog(params)
  if (params.op === 'llm-delete') return llmDelete(params)
  if (params.op === 'llm-rerun') return llmRerun(params)
  if (params.dataset === 'settings' || ['settings-save', 'prompt-save', 'prompt-delete', 'skill-save', 'template-save', 'template-preview'].includes(params.op)) return appSettings(params)
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
    if (ds === DATASETS.assessments) await attachRuns(client, items)
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

// AI analyses of one response: list them, or queue a new one and start the ai-analysis action.
async function aiAnalyses (params) {
  const method = (params.__ow_method || 'get').toLowerCase()
  const responseId = String(params.responseId || '')
  if (!UUID_RE.test(responseId)) return reply(400, { ok: false, error: 'invalid responseId' })
  try {
    return await withDb(params, async (client) => {
      const col = client.collection(ai.ANALYSES_COLLECTION)
      await ensureIndexes(col, ai.ANALYSES_INDEXES)
      if (method === 'get') {
        const list = await col.find({ responseId }).limit(100).toArray()
        list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        return reply(200, { ok: true, responseId, analyses: list.map((d) => ai.publicAnalysis(d)) })
      }
      if (method !== 'post') return reply(405, { ok: false, error: 'method not allowed' })

      const response = await findOneOrNull(client.collection(responses.COLLECTION), { responseId })
      if (!response) return reply(404, { ok: false, error: 'not found' })
      if (response.status !== 'completed') return reply(400, { ok: false, error: 'only completed assessments can be sent to AI' })
      const prompt = settings.PROMPT_ID_RE.test(String(params.promptId || ''))
        ? await findOneOrNull(client.collection(settings.PROMPTS_COLLECTION), { promptId: params.promptId })
        : null
      if (!prompt) return reply(400, { ok: false, error: 'choose a saved prompt' })
      const saved = await findOneOrNull(client.collection(settings.SETTINGS_COLLECTION), { key: settings.AI_KEY })
      if (!settings.hasKey(saved)) return reply(400, { ok: false, error: 'no API key is saved; add one on the Settings page' })
      const pending = (await col.find({ responseId, status: { $in: ['queued', 'running'] } }).limit(10).toArray())
        .map((d) => ai.publicAnalysis(d)).filter((d) => d.status !== 'failed')
      if (pending.length) return reply(409, { ok: false, error: 'an analysis of this assessment is already running' })

      const now = new Date().toISOString()
      const doc = {
        analysisId: crypto.randomUUID(),
        responseId,
        submissionId: response.submissionId || null,
        assessment: response.assessment,
        promptId: prompt.promptId,
        promptName: prompt.name,
        promptText: prompt.text,
        trigger: 'manual',
        model: ai.MODEL,
        input: ai.buildInput({ assessment: response.assessment, response, sections: await questions.sectionsOf(client, response.assessment) }),
        status: 'queued',
        createdAt: now,
        createdBy: editorOf(params)
      }
      await col.insertOne(doc)
      try {
        await require('openwhisk')().actions.invoke({ name: 'marketingprototype/ai-analysis', blocking: false, params: { analysisId: doc.analysisId } })
      } catch (e) {
        console.error('assessments-admin could not start ai-analysis:', e.name, e.message)
        await col.updateOne({ analysisId: doc.analysisId }, { $set: { status: 'failed', error: 'The analysis could not be started.', finishedAt: new Date().toISOString() } })
        return reply(500, { ok: false, error: 'the analysis could not be started' })
      }
      console.log('assessments-admin queued AI analysis', doc.analysisId, 'for', responseId)
      return reply(201, { ok: true, analysis: ai.publicAnalysis(doc) })
    })
  } catch (e) {
    console.error('assessments-admin ai-analyses failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

// Sends an earlier LLM query again as a new entry: the same assessment text, and for a wrap-up the wrap-up skill
// as it is saved now (so an edited skill can be tried on the same answers); an admin query repeats its saved
// prompt text. The old entry is kept. A new finished wrap-up is what the user's page receives next.
//   POST {op:'llm-rerun', analysisId, editor?} -> 201 { ok, analysis }
async function llmRerun (params) {
  if ((params.__ow_method || 'get').toLowerCase() !== 'post') return reply(405, { ok: false, error: 'method not allowed' })
  const analysisId = String(params.analysisId || '')
  if (!UUID_RE.test(analysisId)) return reply(400, { ok: false, error: 'invalid analysisId' })
  try {
    return await withDb(params, async (client) => {
      const col = client.collection(ai.ANALYSES_COLLECTION)
      await ensureIndexes(col, ai.ANALYSES_INDEXES)
      const old = await findOneOrNull(col, { analysisId })
      if (!old) return reply(404, { ok: false, error: 'not found' })
      if (!old.input || !old.promptText) return reply(400, { ok: false, error: 'this query has nothing to send again' })
      const store = client.collection(settings.SETTINGS_COLLECTION)
      if (!settings.hasKey(await findOneOrNull(store, { key: settings.AI_KEY }))) return reply(400, { ok: false, error: 'no API key is saved; add one on the Settings page' })
      const pending = (await col.find({ responseId: old.responseId, status: { $in: ['queued', 'running'] } }).limit(10).toArray())
        .map((d) => ai.publicAnalysis(d)).filter((d) => d.status !== 'failed')
      if (pending.length) return reply(409, { ok: false, error: 'a query for this assessment is already running' })

      let systemText = old.systemText
      let templateText = null // a wrap-up uses the template as saved now, filled with the same computed facts
      let skillName = old.skillName || ''
      if (old.trigger === 'wrapup') {
        const skill = await findOneOrNull(store, { key: settings.SKILL_KEY })
        if (!skill || !skill.text) return reply(400, { ok: false, error: 'no wrap-up skill is configured' })
        systemText = settings.skillSystemText(skill)
        skillName = skill.name || ''
        const tplDoc = await findOneOrNull(store, { key: settings.TEMPLATE_KEY })
        if (tplDoc && tplDoc.text) {
          templateText = tplDoc.text
          systemText += require('../lib/template').outputInstructions(templateText)
        }
      }
      const doc = {
        analysisId: crypto.randomUUID(),
        responseId: old.responseId,
        submissionId: old.submissionId || null,
        assessment: old.assessment,
        trigger: old.trigger || 'manual',
        ...(old.promptId ? { promptId: old.promptId } : {}),
        promptName: old.promptName,
        promptText: old.promptText,
        ...(systemText ? { systemText } : {}),
        skillName,
        rerunOf: old.analysisId,
        ...(templateText ? { templateText, computed: old.computed || {} } : {}),
        model: ai.MODEL,
        input: old.input,
        status: 'queued',
        createdAt: new Date().toISOString(),
        createdBy: editorOf(params)
      }
      await col.insertOne(doc)
      try {
        await require('openwhisk')().actions.invoke({ name: 'marketingprototype/ai-analysis', blocking: false, params: { analysisId: doc.analysisId } })
      } catch (e) {
        console.error('assessments-admin could not start ai-analysis:', e.name, e.message)
        await col.updateOne({ analysisId: doc.analysisId }, { $set: { status: 'failed', error: 'The analysis could not be started.', finishedAt: new Date().toISOString() } })
        return reply(500, { ok: false, error: 'the analysis could not be started' })
      }
      console.log('assessments-admin re-ran LLM query', old.analysisId, 'as', doc.analysisId)
      return reply(201, { ok: true, analysis: ai.publicAnalysis(doc) })
    })
  } catch (e) {
    console.error('assessments-admin llm-rerun failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

// Facts shown in a template preview (a real wrap-up computes them from the scoring rules)
const SAMPLE_COMPUTED = {
  company: 'Sample company', date: 'January 1, 2027', readinessPct: 62, band: 'Building your case',
  engagement: { label: 'Standard', title: 'Standard engagement', duration: '6 weeks' },
  capabilities: [{ label: 'Connected Data', description: 'Sample description' }, { label: 'Journey Mapping', description: 'Sample description' }],
  capabilityCount: 2
}

// Deletes one LLM log entry (e.g. a wrap-up) by its explicit analysisId. Never by filter. A query that is
// still queued or running is refused so its result is not written to a missing record.
//   POST {op:'llm-delete', analysisId} -> { ok, deleted:1 }
async function llmDelete (params) {
  if ((params.__ow_method || 'get').toLowerCase() !== 'post') return reply(405, { ok: false, error: 'method not allowed' })
  const analysisId = String(params.analysisId || '')
  if (!UUID_RE.test(analysisId)) return reply(400, { ok: false, error: 'invalid analysisId' })
  try {
    return await withDb(params, async (client) => {
      const col = client.collection(ai.ANALYSES_COLLECTION)
      const doc = await findOneOrNull(col, { analysisId })
      if (!doc) return reply(404, { ok: false, error: 'not found' })
      const status = ai.publicAnalysis(doc).status
      if (status === 'queued' || status === 'running') return reply(409, { ok: false, error: 'this query is still running' })
      const res = await col.deleteOne({ analysisId })
      if (!res || !res.deletedCount) return reply(404, { ok: false, error: 'not found' })
      console.log('assessments-admin deleted LLM log entry', analysisId, doc.trigger || '')
      return reply(200, { ok: true, deleted: 1 })
    })
  } catch (e) {
    console.error('assessments-admin llm-delete failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

// LLM log: every query sent to the model (admin "Send to AI" and the wrap-up on the public page),
// newest first. The list leaves out the long input and output; ?analysisId=... returns one in full.
async function llmLog (params) {
  if ((params.__ow_method || 'get').toLowerCase() !== 'get') return reply(405, { ok: false, error: 'method not allowed' })
  const filter = {}
  if (params.analysisId) {
    if (!UUID_RE.test(String(params.analysisId))) return reply(400, { ok: false, error: 'invalid analysisId' })
    filter.analysisId = params.analysisId
  }
  if (params.status) {
    if (!ai.STATUSES.includes(params.status)) return reply(400, { ok: false, error: 'invalid status' })
    filter.status = params.status
  }
  if (params.trigger) {
    if (!ai.TRIGGERS.includes(params.trigger)) return reply(400, { ok: false, error: 'invalid trigger' })
    filter.trigger = params.trigger
  }
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 100, 1), 200)
  const skip = Math.max(parseInt(params.skip, 10) || 0, 0)
  try {
    return await withDb(params, async (client) => {
      const col = client.collection(ai.ANALYSES_COLLECTION)
      await ensureIndexes(col, ai.ANALYSES_INDEXES)
      if (params.analysisId) {
        const d = await findOneOrNull(col, filter)
        if (!d) return reply(404, { ok: false, error: 'not found' })
        return reply(200, { ok: true, entry: { ...ai.publicAnalysis(d), systemText: d.systemText || '', promptText: d.promptText || '', rawOutput: d.rawOutput || '' } })
      }
      const total = await col.countDocuments(filter)
      const docs = total ? await col.find(filter).sort('createdAt', -1).skip(skip).limit(limit).toArray() : []
      const items = docs.map((d) => {
        const { input, output, ...rest } = ai.publicAnalysis(d)
        return { ...rest, inputChars: (input || '').length, outputChars: (output || '').length, submissionId: d.submissionId || null }
      })
      return reply(200, { ok: true, dataset: 'llm-log', total, count: items.length, items })
    })
  } catch (e) {
    console.error('assessments-admin llm-log failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

// Each profile's latest linked response (by last save), so the viewer can show who is still in
// the middle of the assessment.
async function attachRuns (client, items) {
  const ids = items.map((i) => i.submissionId).filter(Boolean)
  if (!ids.length) return
  const runs = await client.collection(responses.COLLECTION).find({ submissionId: { $in: ids } }).limit(5000).toArray()
  const latest = new Map()
  for (const r of runs) {
    const prev = latest.get(r.submissionId)
    if (!prev || String(r.updatedAt || r.createdAt) > String(prev.updatedAt || prev.createdAt)) latest.set(r.submissionId, r)
  }
  const banks = new Map()
  for (const i of items) {
    const r = latest.get(i.submissionId)
    if (!r) { i.run = null; continue }
    if (!banks.has(r.assessment)) banks.set(r.assessment, await questions.sectionsOf(client, r.assessment))
    const bank = banks.get(r.assessment)
    let answered = 0
    let totalQuestions = 0
    for (const [sectionId, { data }] of bank) {
      const given = ((r.sections || {})[sectionId] || {}).answers || {}
      totalQuestions += data.questions.length
      answered += data.questions.filter((q) => (given[q.id] || []).length > 0).length
    }
    i.run = {
      responseId: r.responseId,
      status: r.status,
      answered,
      totalQuestions,
      completedSections: ((r.progress || {}).completed || []).length,
      totalSections: bank.size,
      updatedAt: r.updatedAt || r.createdAt
    }
  }
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
          ...(r.view ? { view: r.view } : {}),
          status: r.status,
          progress: r.progress || { completed: [] },
          result: labelResult(r.assessment, r.result, banks.get(r.assessment)),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          completedAt: r.completedAt || null,
          sections: questions.answerSheet(banks.get(r.assessment), r.sections)
        })
      }
      // the initial form (profile, consent, source) as stored, without internal fields
      const doc = await findOneOrNull(client.collection(assessments.COLLECTION), { submissionId: params.submissionId })
      const submission = doc ? (({ _id, client: ua, ...rest }) => rest)(doc) : null
      return reply(200, { ok: true, submissionId: params.submissionId, submission, count: out.length, runs: out })
    })
  } catch (e) {
    console.error('assessments-admin profile-answers failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

// Answers for the profile list's CSV export: one entry per profile, from its latest linked run.
async function answersExport (params) {
  const assessment = params.assessment || assessments.DEFAULT_ASSESSMENT
  if (!assessments.ASSESSMENT_IDS.includes(assessment)) return reply(400, { ok: false, error: 'invalid assessment' })
  try {
    return await withDb(params, async (client) => {
      const bank = await questions.sectionsOf(client, assessment)
      const columns = [...bank.values()].flatMap(({ data }) => data.questions.map((q) => ({
        key: `${data.sectionId}.${q.id}`, section: data.sectionId, sectionTitle: data.eyebrow || data.sectionId, question: q.id, text: q.title || q.id
      })))
      // capability names: options that stand for a capability (e.g. the AI-readiness picks) carry them
      const capabilityNames = {}
      for (const { data } of bank.values()) {
        for (const q of data.questions) {
          for (const o of q.options || []) {
            if (Array.isArray(o.capabilities) && o.capabilities.length === 1 && o.capabilities[0] === o.id) capabilityNames[o.id] = o.label
          }
        }
      }
      const runs = await client.collection(responses.COLLECTION)
        .find({ assessment, submissionId: { $ne: null } }).limit(5000).toArray()
      runs.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      const rows = {}
      for (const r of runs) {
        if (!r.submissionId) continue
        if (rows[r.submissionId]) { rows[r.submissionId].runs += 1; continue }
        const answers = {}
        for (const s of questions.answerSheet(bank, r.sections)) {
          for (const q of s.questions) {
            if (q.values.length) answers[`${s.section}.${q.question}`] = q.values.map(questions.valueText).join('; ')
          }
        }
        const res = r.result || {}
        rows[r.submissionId] = {
          runs: 1,
          status: r.status,
          startedAt: r.createdAt,
          updatedAt: r.updatedAt,
          completedAt: r.completedAt || null,
          completedSections: ((r.progress || {}).completed || []).length,
          readinessPct: typeof res.readinessPct === 'number' ? res.readinessPct : null,
          headline: res.headline || null,
          engagement: res.engagement || null,
          capabilities: (res.matchedCapabilities || []).map((c) => capabilityNames[c.id] || c.id),
          answers
        }
      }
      return reply(200, { ok: true, assessment, columns, rows })
    })
  } catch (e) {
    console.error('assessments-admin answers-export failed:', e.name, e.httpStatusCode, e.message)
    return reply(500, { ok: false, error: 'internal error' })
  }
}

// Settings page: the AI service's API key (stored encrypted, write-only) and the stored prompts.
async function appSettings (params) {
  const method = (params.__ow_method || 'get').toLowerCase()
  try {
    return await withDb(params, async (client) => {
      const store = client.collection(settings.SETTINGS_COLLECTION)
      const prompts = client.collection(settings.PROMPTS_COLLECTION)
      await ensureIndexes(store, settings.SETTINGS_INDEXES)
      await ensureIndexes(prompts, settings.PROMPT_INDEXES)
      const now = new Date().toISOString()
      const editor = editorOf(params)

      if (method === 'get') {
        const ai = await findOneOrNull(store, { key: settings.AI_KEY })
        const list = await prompts.find({}).limit(500).toArray()
        list.sort((a, b) => String(a.name).localeCompare(String(b.name)))
        const skill = await findOneOrNull(store, { key: settings.SKILL_KEY })
        const template = await findOneOrNull(store, { key: settings.TEMPLATE_KEY })
        return reply(200, { ok: true, ai: settings.publicAi(ai), prompts: list.map(settings.publicPrompt), skill: settings.publicSkill(skill), template: settings.publicTemplate(template) })
      }
      if (method !== 'post') return reply(405, { ok: false, error: 'method not allowed' })

      if (params.op === 'template-preview') {
        // fills the template with placeholder text (or sample data) so it can be seen without calling Claude
        const { text, errors } = settings.validateTemplate(params.template)
        if (Object.keys(errors).length) return reply(400, { ok: false, errors })
        const tpl = require('../lib/template')
        const shape = tpl.skeleton(text)
        const fill = (v, key) => (Array.isArray(v) ? [0, 1].map(() => fill(v[0], key)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, k)])) : `Sample ${String(key || 'text').replace(/_/g, ' ')}`)
        const html = tpl.render(text, fill(shape), SAMPLE_COMPUTED)
        return reply(200, { ok: true, html, fields: shape })
      }

      if (params.op === 'template-save') {
        if (params.clear === true) {
          await store.deleteOne({ key: settings.TEMPLATE_KEY })
          return reply(200, { ok: true, template: null })
        }
        const { text, errors } = settings.validateTemplate(params.template)
        if (Object.keys(errors).length) return reply(400, { ok: false, errors })
        const existing = await findOneOrNull(store, { key: settings.TEMPLATE_KEY })
        const fields = { text, updatedAt: now, updatedBy: editor }
        if (existing) await store.updateOne({ key: settings.TEMPLATE_KEY }, { $set: fields })
        else await store.insertOne({ key: settings.TEMPLATE_KEY, ...fields, createdAt: now })
        console.log('assessments-admin saved the wrap-up template,', text.length, 'characters')
        return reply(200, { ok: true, template: settings.publicTemplate(await findOneOrNull(store, { key: settings.TEMPLATE_KEY })) })
      }

      if (params.op === 'skill-save') {
        const { name, text, files, errors } = settings.validateSkill(params.skill)
        if (Object.keys(errors).length) return reply(400, { ok: false, errors })
        const existing = await findOneOrNull(store, { key: settings.SKILL_KEY })
        const fields = { name, text, files, updatedAt: now, updatedBy: editor }
        if (existing) await store.updateOne({ key: settings.SKILL_KEY }, { $set: fields })
        else await store.insertOne({ key: settings.SKILL_KEY, ...fields, createdAt: now })
        console.log('assessments-admin saved the wrap-up skill', name)
        return reply(200, { ok: true, skill: settings.publicSkill(await findOneOrNull(store, { key: settings.SKILL_KEY })) })
      }

      if (params.op === 'settings-save') {
        const { set, unset, errors } = settings.validateAi(params.ai, params.aiKeyPublic)
        if (Object.keys(errors).length) return reply(400, { ok: false, errors })
        const existing = await findOneOrNull(store, { key: settings.AI_KEY })
        const fields = { ...set, updatedAt: now, updatedBy: editor }
        if (existing) {
          await store.updateOne({ key: settings.AI_KEY }, { $set: fields, ...(Object.keys(unset).length ? { $unset: unset } : {}) })
        } else {
          await store.insertOne({ key: settings.AI_KEY, ...fields, createdAt: now })
        }
        console.log('assessments-admin', set.apiKey ? 'saved a new AI API key' : 'removed the AI API key')
        return reply(200, { ok: true, ai: settings.publicAi(await findOneOrNull(store, { key: settings.AI_KEY })) })
      }

      if (params.op === 'prompt-save') {
        const { promptId, name, text, errors } = settings.validatePrompt(params.prompt)
        if (Object.keys(errors).length) return reply(400, { ok: false, errors })
        if (promptId) {
          const existing = await findOneOrNull(prompts, { promptId })
          if (!existing) return reply(404, { ok: false, errors: { promptId: 'not found' } })
          await prompts.updateOne({ promptId }, { $set: { name, text, updatedAt: now, updatedBy: editor } })
          return reply(200, { ok: true, created: false, prompt: settings.publicPrompt(await findOneOrNull(prompts, { promptId })) })
        }
        const doc = { promptId: crypto.randomUUID(), name, text, createdAt: now, updatedAt: now, updatedBy: editor }
        await prompts.insertOne(doc)
        return reply(201, { ok: true, created: true, prompt: settings.publicPrompt(doc) })
      }

      // prompt-delete
      if (!settings.PROMPT_ID_RE.test(String(params.promptId || ''))) return reply(400, { ok: false, error: 'invalid promptId' })
      const res = await prompts.deleteOne({ promptId: params.promptId })
      if (!res || !res.deletedCount) return reply(404, { ok: false, error: 'not found' })
      return reply(200, { ok: true, deleted: 1 })
    })
  } catch (e) {
    if (isNotFound(e)) return reply(404, { ok: false, error: 'not found' })
    console.error('assessments-admin settings failed:', e.name, e.httpStatusCode, e.message)
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
