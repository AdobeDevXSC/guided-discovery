// Validation for assessment responses (collection assessment_responses): one document per person
// per assessment run. Answers are checked against the question bank (actions/lib/questions.js).
// See docs/assessment-responses-schema.md.
const COLLECTION = 'assessment_responses'
const LEGACY_COLLECTION = 'gd_sessions' // pre-rename sessions; copied by scripts/migrate-gd-sessions.js
const SCHEMA_VERSION = 2
const STATUSES = ['started', 'in_progress', 'completed']

const SOURCE_RE = /^[\w.:/\- ]{0,100}$/

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// The profile is captured by the assessment's initial form (collection cja_assessments), which
// hands its submissionId to the page as ?lead=. A response stores only that reference.
function leadRefId (input) {
  const id = typeof input === 'string' ? input : (isObj(input) ? input.submissionId : '')
  return UUID_RE.test(id || '') ? id : null
}

function cleanSource (input) {
  const s = typeof input === 'string' ? { source: input } : (isObj(input) ? input : {})
  const pick = (v, max) => str(v).slice(0, max)
  const out = {
    source: SOURCE_RE.test(str(s.source)) ? str(s.source) : '',
    pageUrl: pick(s.pageUrl, 500),
    referrer: pick(s.referrer, 500)
  }
  const utm = {}
  for (const k of ['source', 'medium', 'campaign', 'term', 'content']) {
    const v = pick(s.utm && s.utm[k], 100)
    if (v) utm[k] = v
  }
  if (Object.keys(utm).length) out.utm = utm
  return out
}

function checker (section) {
  const errors = {}
  const fail = (path, msg) => { errors[path ? `${section}.${path}` : section] = msg }
  const known = (obj, allowed) => {
    if (!isObj(obj)) { fail('', 'must be an object'); return false }
    Object.keys(obj).filter((k) => !allowed.includes(k)).forEach((k) => fail(k, 'unknown field'))
    return true
  }
  return { errors, fail, known }
}

// Sections are stored by their authored sectionId (schema guided-discovery-section). Clients from
// before the rename sent "sc-<sectionId>"; the prefix is accepted and dropped.
const SECTION_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/
function sectionIdOf (key) {
  const id = typeof key === 'string' ? key.replace(/^sc-/, '') : ''
  return SECTION_ID_RE.test(id) && id !== 'summary' && id !== 'overview' ? id : null
}

/**
 * Validates { answers: { questionId: [optionId...] } } against the section's published structured
 * document (doc.data.questions). Without a doc (delivery unreachable) only the shape is checked.
 */
function validateStructured (key, value, doc) {
  const c = checker(key)
  if (!c.known(value, ['answers'])) return { data: {}, errors: c.errors }
  const answers = value.answers === undefined ? {} : value.answers
  if (!isObj(answers)) { c.fail('answers', 'must be an object'); return { data: {}, errors: c.errors } }
  const questions = doc && Array.isArray(doc.questions) ? doc.questions : null
  const out = {}
  for (const [qid, picked] of Object.entries(answers)) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(qid)) { c.fail(`answers.${qid}`, 'invalid question id'); continue }
    if (!Array.isArray(picked) || picked.length > 100 || picked.some((v) => typeof v !== 'string' || v.length > 500)) {
      c.fail(`answers.${qid}`, 'must be an array of option ids'); continue
    }
    const ids = [...new Set(picked)]
    if (questions) {
      const q = questions.find((x) => x.id === qid)
      if (!q) { c.fail(`answers.${qid}`, 'unknown question'); continue }
      if (q.display === 'text') {
        // free text: one value, up to 500 characters
        const text = ids.map((v) => v.trim()).filter(Boolean)
        if (text.length > 1) { c.fail(`answers.${qid}`, 'at most 1'); continue }
        if (text.length) out[qid] = text
        continue
      }
      if (q.display === 'sort') {
        // "optionId:choiceId", one per option
        const opts = (q.options || []).map((o) => o.id)
        const choices = (q.choices || []).map((o) => o.id)
        const bad = ids.find((v) => {
          const [opt, choice, extra] = v.split(':')
          return extra !== undefined || !opts.includes(opt) || !choices.includes(choice)
        })
        if (bad) { c.fail(`answers.${qid}`, `invalid sort answer ${bad.slice(0, 64)}`); continue }
        if (new Set(ids.map((v) => v.split(':')[0])).size !== ids.length) { c.fail(`answers.${qid}`, 'one answer per option'); continue }
        if (ids.length) out[qid] = ids
        continue
      }
      if (q.display === 'owner-cards') {
        // "optionId=Owner name" (one per option) and "optionId:follow-up"
        const opts = (q.options || []).map((o) => o.id)
        const owners = new Set()
        const bad = ids.find((v) => {
          const flag = /^([a-z0-9][a-z0-9-]*):follow-up$/.exec(v)
          if (flag) return !opts.includes(flag[1])
          const owner = /^([a-z0-9][a-z0-9-]*)=(.{1,120})$/.exec(v)
          if (!owner || !opts.includes(owner[1]) || owners.has(owner[1])) return true
          owners.add(owner[1])
          return false
        })
        if (bad) { c.fail(`answers.${qid}`, `invalid owner answer ${bad.slice(0, 64)}`); continue }
        if (ids.length) out[qid] = ids
        continue
      }
      if (q.display === 'per-item') {
        // "itemId:choiceId", one per item; items are the options of the itemsFrom question
        const source = questions.find((x) => x.id === q.itemsFrom) || {}
        const items = (source.options || []).map((o) => o.id)
        const choices = (q.choices || []).map((o) => o.id)
        const bad = ids.find((v) => {
          const [item, choice, extra] = v.split(':')
          return extra !== undefined || !items.includes(item) || !choices.includes(choice)
        })
        if (bad) { c.fail(`answers.${qid}`, `invalid item answer ${bad.slice(0, 64)}`); continue }
        const perItem = new Set(ids.map((v) => v.split(':')[0]))
        if (perItem.size !== ids.length) { c.fail(`answers.${qid}`, 'one answer per item'); continue }
        if (ids.length) out[qid] = ids
        continue
      }
      const allowed = (q.options || []).map((o) => o.id)
      const unknown = ids.filter((o) => !allowed.includes(o))
      if (unknown.length) { c.fail(`answers.${qid}`, `unknown option ${unknown[0]}`); continue }
      // sliders and *-single displays take one answer; swipe and *-multi take any number
      const single = /-single$/.test(q.display || '') || q.display === 'slider'
      if (single && ids.length > 1) { c.fail(`answers.${qid}`, 'at most 1'); continue }
    }
    if (ids.length) out[qid] = ids
  }
  return { data: { answers: out }, errors: c.errors }
}

const PAGE_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

// progress.completed lists section ids (authored, so only their shape is checked). lastPage is
// accepted and dropped: sessions saved before it was retired still send it back after resuming.
function validateProgress (input) {
  if (input === undefined) return { progress: undefined, errors: {} }
  const c = checker('progress')
  if (!c.known(input, ['completed', 'lastPage'])) return { errors: c.errors }
  if (input.completed !== undefined && !Array.isArray(input.completed)) c.fail('completed', 'must be an array')
  const completed = Array.isArray(input.completed) ? [...new Set(input.completed)] : []
  completed.filter((p) => !PAGE_RE.test(String(p)))
    .forEach((p) => c.fail('completed', `invalid page ${String(p).slice(0, 40)}`))
  if (completed.length > 40) c.fail('completed', 'at most 40')
  return { progress: { completed: completed.filter((p) => PAGE_RE.test(String(p))).slice(0, 40) }, errors: c.errors }
}

const INDEXES = [
  { spec: { responseId: 1 }, options: { unique: true } },
  { spec: { userId: 1, assessment: 1 }, options: {} },
  { spec: { submissionId: 1 }, options: {} },
  { spec: { assessment: 1, status: 1, createdAt: -1 }, options: {} },
  { spec: { 'source.source': 1 }, options: {} }
]

module.exports = {
  COLLECTION, LEGACY_COLLECTION, SCHEMA_VERSION, STATUSES, INDEXES,
  leadRefId, cleanSource, validateProgress, sectionIdOf, validateStructured
}
