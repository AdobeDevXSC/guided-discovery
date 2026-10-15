// Validation for the self-guided AA -> CJA Guided Discovery (collection gd_sessions).
// Allowed IDs come from the catalog shared with the EDS block, so the two cannot drift.
const catalog = require('../../../blocks/guided-discovery/lib/catalog.js')

const COLLECTION = 'gd_sessions'
const SCHEMA_VERSION = 1
const STATUSES = ['started', 'in_progress', 'completed']

const {
  BUCKETS, NEEDS, PROMPTS, DF_ITEMS, DF_QUANTITIES, SEGMENTS, IDENTITY_STAGES, GOVERNANCE,
  GOV_STATUSES, ROLES, CAPABILITIES, PAGES, REFERENCE_PAGES
} = catalog

const ids = (arr) => arr.map((x) => (typeof x === 'string' ? x : x.id))
const NEED_IDS = ids(NEEDS)
const DF_IDS = ids(DF_ITEMS)
const SEGMENT_IDS = ids(SEGMENTS)
const DISCOVERY_PROMPTS = PROMPTS.filter((p) => p.group !== 'strategy')
const STRATEGY_PROMPTS = PROMPTS.filter((p) => p.group === 'strategy')
const ALL_PAGES = [...PAGES, ...REFERENCE_PAGES]

// Section keys stored under `sections.<key>`.
const SECTION_KEYS = [
  'discovery', 'dataFoundations', 'segmentation', 'identity', 'governance', 'roles',
  'strategyAdoption', 'inventoryReview'
]

const SOURCE_RE = /^[\w.:/\- ]{0,100}$/

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// The lead is captured by the CJA migration assessment form (collection cja_assessments), which
// hands its submissionId to this page as ?lead=. A session stores only that reference.
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

// ---- section validators: each returns { data, errors } and rejects unknown keys and IDs ----

function checker (section) {
  const errors = {}
  const fail = (path, msg) => { errors[path ? `${section}.${path}` : section] = msg }
  const known = (obj, allowed) => {
    if (!isObj(obj)) { fail('', 'must be an object'); return false }
    Object.keys(obj).filter((k) => !allowed.includes(k)).forEach((k) => fail(k, 'unknown field'))
    return true
  }
  const idList = (path, v, allowed, max = allowed.length) => {
    if (v === undefined) return []
    if (!Array.isArray(v)) { fail(path, 'must be an array'); return [] }
    const out = [...new Set(v)]
    if (out.length > max) fail(path, `at most ${max}`)
    out.filter((x) => !allowed.includes(x)).forEach((x) => fail(path, `unknown id ${String(x).slice(0, 40)}`))
    return out.filter((x) => allowed.includes(x))
  }
  const idMap = (path, v, keys, values) => {
    if (v === undefined) return {}
    if (!isObj(v)) { fail(path, 'must be an object'); return {} }
    const out = {}
    for (const [k, val] of Object.entries(v)) {
      if (!keys.includes(k)) fail(`${path}.${k}`, 'unknown id')
      else if (val === null || val === '') continue
      else if (!values.includes(val)) fail(`${path}.${k}`, 'not an allowed value')
      else out[k] = val
    }
    return out
  }
  const oneOf = (path, v, allowed) => {
    if (v === undefined || v === null || v === '') return null
    if (!allowed.includes(v)) { fail(path, 'not an allowed value'); return null }
    return v
  }
  // prompt answers: { promptId: [optionId...] }, single-select prompts allow at most one
  const answers = (path, v, prompts) => {
    if (v === undefined) return {}
    if (!isObj(v)) { fail(path, 'must be an object'); return {} }
    const out = {}
    for (const [pid, val] of Object.entries(v)) {
      const prompt = prompts.find((p) => p.id === pid)
      if (!prompt) { fail(`${path}.${pid}`, 'unknown prompt'); continue }
      const picked = idList(`${path}.${pid}`, val, prompt.options, prompt.single ? 1 : prompt.options.length)
      if (picked.length) out[pid] = picked
    }
    return out
  }
  return { errors, fail, known, idList, idMap, oneOf, answers }
}

const SECTIONS = {
  discovery (v, c) {
    if (!c.known(v, ['focus', 'needs', 'answers'])) return {}
    return {
      focus: c.oneOf('focus', v.focus, BUCKETS),
      needs: c.idList('needs', v.needs, NEED_IDS),
      answers: c.answers('answers', v.answers, DISCOVERY_PROMPTS)
    }
  },
  dataFoundations (v, c) {
    if (!c.known(v, ['selected', 'quantity', 'dataView'])) return {}
    return {
      selected: c.idList('selected', v.selected, DF_IDS),
      quantity: c.idMap('quantity', v.quantity, DF_IDS, DF_QUANTITIES),
      dataView: c.idList('dataView', v.dataView, DF_IDS)
    }
  },
  segmentation (v, c) {
    if (!c.known(v, ['prioritized'])) return {}
    return { prioritized: c.idList('prioritized', v.prioritized, SEGMENT_IDS) }
  },
  identity (v, c) {
    if (!c.known(v, ['current', 'target'])) return {}
    return { current: c.oneOf('current', v.current, IDENTITY_STAGES), target: c.oneOf('target', v.target, IDENTITY_STAGES) }
  },
  governance (v, c) {
    if (!c.known(v, ['status'])) return {}
    return { status: c.idMap('status', v.status, GOVERNANCE, GOV_STATUSES) }
  },
  roles (v, c) {
    if (!c.known(v, ['owners', 'followUp'])) return {}
    const owners = {}
    if (v.owners !== undefined && !isObj(v.owners)) c.fail('owners', 'must be an object')
    for (const [role, name] of Object.entries(isObj(v.owners) ? v.owners : {})) {
      if (!ROLES.includes(role)) c.fail(`owners.${role}`, 'unknown id')
      else if (typeof name !== 'string' || name.length > 120) c.fail(`owners.${role}`, 'max 120 chars')
      else if (name.trim()) owners[role] = name.trim()
    }
    return { owners, followUp: c.idList('followUp', v.followUp, ROLES) }
  },
  strategyAdoption (v, c) {
    if (!c.known(v, ['answers', 'aiCapabilityPicks'])) return {}
    return {
      answers: c.answers('answers', v.answers, STRATEGY_PROMPTS),
      // any of the 8 capabilities in the AI-readiness grid can be picked (live app: toggleAiPriority)
      aiCapabilityPicks: c.idList('aiCapabilityPicks', v.aiCapabilityPicks, CAPABILITIES)
    }
  },
  inventoryReview (v, c) {
    if (!c.known(v, ['added'])) return {}
    if (v.added !== undefined && !Array.isArray(v.added)) { c.fail('added', 'must be an array'); return {} }
    const added = (v.added || []).slice(0, 50).map((row, i) => {
      if (!isObj(row)) { c.fail(`added.${i}`, 'must be an object'); return null }
      const name = str(row.name).slice(0, 200)
      const note = str(row.note).slice(0, 1000)
      return name || note ? { name, note } : null
    }).filter(Boolean)
    if ((v.added || []).length > 50) c.fail('added', 'at most 50')
    return { added }
  }
}

// Structured-content sections ("sc-<sectionId>") are authored in DA (schema guided-discovery-section)
// and validated against the published document instead of the catalog.
const STRUCTURED_KEY_RE = /^sc-[a-z0-9][a-z0-9-]{0,62}$/
const isStructuredKey = (key) => STRUCTURED_KEY_RE.test(key || '')

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
    if (!Array.isArray(picked) || picked.length > 100 || picked.some((v) => typeof v !== 'string' || v.length > 130)) {
      c.fail(`answers.${qid}`, 'must be an array of option ids'); continue
    }
    const ids = [...new Set(picked)]
    if (questions) {
      const q = questions.find((x) => x.id === qid)
      if (!q) { c.fail(`answers.${qid}`, 'unknown question'); continue }
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

function validateSection (key, value) {
  if (!SECTION_KEYS.includes(key)) return { errors: { section: 'unknown section' } }
  const c = checker(key)
  const data = SECTIONS[key](value, c)
  return { data, errors: c.errors }
}

function validateProgress (input) {
  if (input === undefined) return { progress: undefined, errors: {} }
  const c = checker('progress')
  if (!c.known(input, ['completed', 'lastPage'])) return { errors: c.errors }
  // catalog pages plus structured section ids (authored, so only their shape is checked)
  const completed = Array.isArray(input.completed) ? [...new Set(input.completed)] : []
  if (input.completed !== undefined && !Array.isArray(input.completed)) c.fail('completed', 'must be an array')
  completed.filter((p) => !PAGES.includes(p) && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(p)))
    .forEach((p) => c.fail('completed', `invalid page ${String(p).slice(0, 40)}`))
  if (completed.length > 40) c.fail('completed', 'at most 40')
  const progress = { completed: completed.filter((p) => PAGES.includes(p) || /^[a-z0-9][a-z0-9-]{0,63}$/.test(String(p))).slice(0, 40) }
  const last = c.oneOf('lastPage', input.lastPage, ALL_PAGES)
  if (last) progress.lastPage = last
  return { progress, errors: c.errors }
}

const INDEXES = [
  { spec: { sessionId: 1 }, options: { unique: true } },
  { spec: { 'leadRef.submissionId': 1 }, options: {} },
  { spec: { status: 1, createdAt: -1 }, options: {} },
  { spec: { 'source.source': 1 }, options: {} }
]

module.exports = {
  COLLECTION, SCHEMA_VERSION, STATUSES, SECTION_KEYS, INDEXES,
  leadRefId, cleanSource, validateSection, validateProgress, isStructuredKey, validateStructured
}
