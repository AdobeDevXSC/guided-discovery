// The question bank (collection assessment_questions): one document per question, edited in the
// admin viewer. The responses API validates answers and scores results against it.
//
// A question keeps the field names of the original structured-content section schema
// (guided-discovery-section) so validation and scoring read it unchanged:
//   { assessment, questionId, section, sectionTitle, sectionOrder, order,
//     title, help, display, required, options:[{id, label, ...}], choices, itemsFrom, ...,
//     createdAt, updatedAt, updatedBy }
const crypto = require('crypto')

const COLLECTION = 'assessment_questions'
const INDEXES = [
  { spec: { assessment: 1, questionId: 1 }, options: { unique: true } },
  { spec: { assessment: 1, sectionOrder: 1, order: 1 }, options: {} }
]

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const RESERVED_SECTIONS = ['summary', 'overview']

// Answer types an editor can create; the rest exist only on seeded questions and are kept as-is.
const NEW_TYPES = {
  single: 'chips-single', // one option
  multiple: 'chips-multi', // any number of options
  text: 'text' // free text, one value up to 500 characters
}
const TYPE_OF_DISPLAY = {
  'cards-single': 'single',
  'chips-single': 'single',
  slider: 'single',
  'cards-multi': 'multiple',
  'chips-multi': 'multiple',
  swipe: 'multiple',
  inventory: 'multiple',
  text: 'text',
  sort: 'choice per option',
  'per-item': 'choice per item',
  'owner-cards': 'owner per option'
}

const str = (v) => (typeof v === 'string' ? v.trim() : '')

// Sections per assessment, rebuilt from the bank at most every 30 seconds per warm container.
const TTL_MS = 30 * 1000
const cache = new Map()
function forget (assessment) { cache.delete(assessment) }

/** Map sectionId -> { data: { sectionId, eyebrow, questions:[{ id, ... }] }, hash } in page order. */
async function sectionsOf (client, assessment) {
  const hit = cache.get(assessment)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.sections
  const docs = await client.collection(COLLECTION).find({ assessment }).limit(1000).toArray()
  docs.sort((a, b) => (a.sectionOrder - b.sectionOrder) || (a.order - b.order))
  const sections = new Map()
  for (const d of docs) {
    if (!sections.has(d.section)) sections.set(d.section, { sectionId: d.section, eyebrow: d.sectionTitle, questions: [] })
    sections.get(d.section).questions.push(asQuestion(d))
  }
  const out = new Map()
  for (const [id, data] of sections) {
    const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16)
    out.set(id, { data, hash })
  }
  cache.set(assessment, { at: Date.now(), sections: out })
  return out
}

// The stored document in section-schema shape (id instead of questionId, bookkeeping dropped).
function asQuestion (d) {
  const {
    _id, assessment, questionId, section, sectionTitle, sectionOrder, order, createdAt, updatedAt, updatedBy, ...rest
  } = d
  return { id: questionId, ...rest }
}

/** What a caller needs to show the questions and post answers (public, no bookkeeping). */
function publicSections (sections) {
  return [...sections.values()].map(({ data }) => ({
    section: data.sectionId,
    title: data.eyebrow || data.sectionId,
    questions: data.questions.map((q) => ({
      question: q.id,
      text: q.title || '',
      ...(q.help ? { help: q.help } : {}),
      type: TYPE_OF_DISPLAY[q.display] || q.display,
      display: q.display,
      required: Boolean(q.required),
      options: (q.options || []).map((o) => ({ key: o.id, label: o.label })),
      ...(q.choices ? { choices: q.choices.map((c) => ({ key: c.id, label: c.label })) } : {}),
      ...(q.itemsFrom ? { itemsFrom: q.itemsFrom } : {})
    }))
  }))
}

/**
 * Checks an editor's create/update. Keys (question, section, options) are fixed once saved:
 * existing options can be relabelled but not removed, and the answer type can't change.
 * Returns { doc, errors } where doc holds the fields to store.
 */
function validateEdit (input, existing, now, user) {
  const errors = {}
  const q = input && typeof input === 'object' ? input : {}
  const questionId = existing ? existing.questionId : str(q.questionId)
  if (!existing && !ID_RE.test(questionId)) errors.questionId = 'use lowercase letters, numbers and hyphens'
  const section = existing ? existing.section : str(q.section)
  if (!existing && (!ID_RE.test(section) || RESERVED_SECTIONS.includes(section))) errors.section = 'invalid section key'
  const title = str(q.title)
  if (!title) errors.title = 'required'
  else if (title.length > 500) errors.title = 'at most 500 characters'
  const help = str(q.help)
  if (help.length > 1000) errors.help = 'at most 1000 characters'
  const sectionTitle = str(q.sectionTitle) || (existing && existing.sectionTitle) || ''
  if (sectionTitle.length > 120) errors.sectionTitle = 'at most 120 characters'

  let display = existing ? existing.display : NEW_TYPES[q.type]
  if (!existing && !display) errors.type = `type must be ${Object.keys(NEW_TYPES).join(', ')}`
  if (existing && q.type && TYPE_OF_DISPLAY[existing.display] !== q.type) errors.type = 'the answer type of a saved question cannot change'
  display = display || 'chips-single'

  const given = Array.isArray(q.options) ? q.options : []
  const before = existing ? existing.options || [] : []
  const seen = new Set()
  const options = []
  given.forEach((o, i) => {
    const id = str(o && (o.key || o.id))
    const label = str(o && o.label)
    if (!ID_RE.test(id)) { errors[`options.${i}.key`] = 'use lowercase letters, numbers and hyphens'; return }
    if (seen.has(id)) { errors[`options.${i}.key`] = 'duplicate key'; return }
    if (!label) { errors[`options.${i}.label`] = 'required'; return }
    if (label.length > 200) { errors[`options.${i}.label`] = 'at most 200 characters'; return }
    seen.add(id)
    const prior = before.find((b) => b.id === id)
    options.push({ ...(prior || {}), id, label }) // keep seeded extras (capabilities, bucket, ...)
  })
  const removed = before.filter((b) => !seen.has(b.id)).map((b) => b.id)
  if (removed.length) errors.options = `saved options cannot be removed: ${removed.join(', ')}`
  if (display !== 'text' && display !== 'per-item' && !options.length) errors.options = 'add at least one option'
  if (display === 'text' && options.length) errors.options = 'free-text questions have no options'

  const doc = {
    questionId,
    section,
    sectionTitle,
    title,
    help,
    display,
    required: q.required === true,
    options,
    updatedAt: now,
    updatedBy: user || ''
  }
  if (!existing) doc.createdAt = now
  return { doc, errors }
}

module.exports = {
  COLLECTION, INDEXES, NEW_TYPES, TYPE_OF_DISPLAY, sectionsOf, publicSections, validateEdit, forget, asQuestion
}
