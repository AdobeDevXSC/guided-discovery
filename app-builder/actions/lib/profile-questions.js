const options = require('../assessments/options.json')

const COLLECTION = 'profile_questions'
const INDEXES = [
  { spec: { questionId: 1 }, options: { unique: true } },
  { spec: { order: 1 }, options: {} }
]
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const COUNTRY_OPTIONS = ['United States', 'Canada', 'United Kingdom', ...options.countries]
  .filter((country, index, list) => list.indexOf(country) === index)

const FIELD_DEFINITIONS = [
  { questionId: 'first-name', field: 'firstName', title: 'First name', type: 'text' },
  { questionId: 'last-name', field: 'lastName', title: 'Last name', type: 'text' },
  { questionId: 'business-email', field: 'email', title: 'Business email', type: 'email' },
  { questionId: 'business-phone', field: 'phone', title: 'Business phone', type: 'phone' },
  { questionId: 'job-title', field: 'jobTitle', title: 'Job title or role', type: 'text' },
  { questionId: 'department', field: 'department', title: 'Department', type: 'text' },
  { questionId: 'organization', field: 'organization', title: 'Organization name', type: 'text' },
  { questionId: 'country', field: 'country', title: 'Country', type: 'select', options: COUNTRY_OPTIONS },
  { questionId: 'country-other', field: 'countryOther', title: 'Your country', type: 'text', required: false },
  { questionId: 'state-province', field: 'state', title: 'State/province', type: 'text' },
  { questionId: 'postal-code', field: 'postalCode', title: 'ZIP/postal code', type: 'text' },
  { questionId: 'primary-product', field: 'primaryProduct', title: 'Primary product of interest', type: 'select', options: options.primaryProducts },
  { questionId: 'industry', field: 'industry', title: 'Industry', type: 'select', options: options.industries }
]

function defaults (now = new Date().toISOString()) {
  return FIELD_DEFINITIONS.map((field, order) => ({
    questionId: field.questionId,
    field: field.field,
    section: 'rfi-intake',
    sectionTitle: 'RFI intake',
    sectionOrder: 7,
    title: field.title,
    help: '',
    type: field.type,
    required: field.required !== false,
    options: (field.options || []).map((label, index) => ({ id: `option-${index + 1}`, label })),
    order,
    createdAt: now,
    updatedAt: now,
    updatedBy: ''
  }))
}

async function seedMissing (col) {
  const saved = await col.find({}).limit(100).toArray()
  const ids = new Set(saved.map((item) => item.questionId))
  const missing = defaults().filter((item) => !ids.has(item.questionId))
  for (const item of missing) {
    // eslint-disable-next-line no-await-in-loop
    await col.insertOne(item)
  }
}

function validateEdit (input, existing, now, user) {
  const errors = {}
  const q = input && typeof input === 'object' ? input : {}
  const title = typeof q.title === 'string' ? q.title.trim() : ''
  const help = typeof q.help === 'string' ? q.help.trim() : ''
  const given = Array.isArray(q.options) ? q.options : []
  const before = existing.options || []
  const seen = new Set()
  const savedOptions = []

  if (!title) errors.title = 'required'
  else if (title.length > 500) errors.title = 'at most 500 characters'
  if (help.length > 1000) errors.help = 'at most 1000 characters'
  if (existing.type !== 'select' && given.length) errors.options = 'text questions have no options'
  if (existing.type === 'select' && !given.length) errors.options = 'add at least one option'

  given.forEach((option, index) => {
    const id = typeof (option && (option.key || option.id)) === 'string' ? (option.key || option.id).trim() : ''
    const label = typeof (option && option.label) === 'string' ? option.label.trim() : ''
    if (!ID_RE.test(id)) { errors[`options.${index}.key`] = 'use lowercase letters, numbers and hyphens'; return }
    if (seen.has(id)) { errors[`options.${index}.key`] = 'duplicate key'; return }
    if (!label) { errors[`options.${index}.label`] = 'required'; return }
    if (label.length > 200) { errors[`options.${index}.label`] = 'at most 200 characters'; return }
    seen.add(id)
    const prior = before.find((item) => item.id === id)
    savedOptions.push({ ...(prior || {}), id, label })
  })

  const removed = before.filter((item) => !seen.has(item.id)).map((item) => item.id)
  if (removed.length) errors.options = `saved options cannot be removed: ${removed.join(', ')}`

  return {
    doc: {
      title,
      help,
      required: q.required === true,
      options: savedOptions,
      updatedAt: now,
      updatedBy: user || ''
    },
    errors
  }
}

function publicQuestion (doc) {
  const { _id, ...question } = doc
  return question
}

module.exports = { COLLECTION, INDEXES, defaults, seedMissing, validateEdit, publicQuestion }
