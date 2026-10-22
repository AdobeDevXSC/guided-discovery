const options = require('./options.json')

const COLLECTION = 'cja_assessments'
// one document per person ({ userId, email }), so repeat submissions share a stable userId
const USERS_COLLECTION = 'cja_users'
const SCHEMA_VERSION = 1
const CONSENT_VERSION = '2026-adobe-marketing-v1'
const STATUSES = ['started', 'in_progress', 'completed']

// Profile fields mirror the "Let's get started" form on the CJA migration
// assessment (Qualtrics SV_2ukJGxddee6mfHg, QIDs noted for traceability).
const PROFILE_FIELDS = {
  firstName: { qid: 'QID29', required: true, max: 100 },
  lastName: { qid: 'QID30', required: true, max: 100 },
  email: { qid: 'QID36', required: true, max: 254, email: true },
  phone: { qid: 'QID39', required: true, max: 30, phone: true },
  jobTitle: { qid: 'QID40', required: true, max: 150 },
  department: { qid: 'QID41', required: true, max: 150 },
  organization: { qid: 'QID42', required: true, max: 200 },
  country: { qid: 'QID43', required: true, oneOf: options.countries },
  countryOther: { qid: 'QID50', requiredIf: p => p.country === 'Other', max: 100 },
  state: { qid: 'QID44', required: true, max: 100 },
  postalCode: { qid: 'QID45', required: true, max: 20 },
  primaryProduct: { qid: 'QID46', required: true, oneOf: options.primaryProducts },
  industry: { qid: 'QID47', required: true, oneOf: options.industries }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9+()\-.\s]{5,30}$/
const SECTION_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i
const SOURCE_RE = /^[\w.:/\- ]{0,100}$/

const str = v => (typeof v === 'string' ? v.trim() : '')

function validateProfile (input) {
  const errors = {}
  const profile = {}
  const src = input && typeof input === 'object' ? input : {}
  for (const [name, rule] of Object.entries(PROFILE_FIELDS)) {
    const value = str(src[name])
    const required = rule.required || (rule.requiredIf && rule.requiredIf(src))
    if (!value) {
      if (required) errors[name] = 'required'
      continue
    }
    if (rule.max && value.length > rule.max) errors[name] = `max ${rule.max} chars`
    else if (rule.oneOf && !rule.oneOf.includes(value)) errors[name] = 'not an allowed value'
    else if (rule.email && !EMAIL_RE.test(value)) errors[name] = 'invalid email'
    else if (rule.phone && !PHONE_RE.test(value)) errors[name] = 'invalid phone number'
    else profile[name] = rule.email ? value.toLowerCase() : value
  }
  return { profile, errors }
}

// Campaign attribution. `source` is the ?source= value the Qualtrics iframe receives.
function cleanSource (input) {
  // the EDS form block sends a plain string (e.g. "aem-eds:/acs/..."); treat it as source.source
  const s = typeof input === 'string' ? { source: input } : (input && typeof input === 'object' ? input : {})
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

// Guided-section answers: { questionId: string | number | boolean | string[] }.
// Section/question ids are free-form because the guided sections are not
// public; the shape is enforced, the content is not.
function validateSection (section, answers) {
  const errors = {}
  if (!SECTION_KEY_RE.test(str(section))) errors.section = 'invalid section key'
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    errors.answers = 'must be an object'
    return { errors }
  }
  const clean = {}
  const entries = Object.entries(answers)
  if (entries.length > 200) errors.answers = 'too many answers'
  for (const [qid, v] of entries) {
    if (!SECTION_KEY_RE.test(qid)) { errors[`answers.${qid}`] = 'invalid question id'; continue }
    const ok = v === null || ['string', 'number', 'boolean'].includes(typeof v) ||
      (Array.isArray(v) && v.length <= 100 && v.every(x => ['string', 'number'].includes(typeof x)))
    if (!ok || (typeof v === 'string' && v.length > 5000)) errors[`answers.${qid}`] = 'invalid value'
    else clean[qid] = v
  }
  return { section: str(section), answers: clean, errors }
}

const INDEXES = [
  { spec: { submissionId: 1 }, options: { unique: true } },
  { spec: { 'profile.email': 1 }, options: {} },
  { spec: { userId: 1 }, options: {} },
  { spec: { status: 1, createdAt: -1 }, options: {} },
  { spec: { 'source.source': 1 }, options: {} }
]

const USER_INDEXES = [
  { spec: { email: 1 }, options: { unique: true } },
  { spec: { userId: 1 }, options: { unique: true } }
]

module.exports = {
  COLLECTION, USERS_COLLECTION, SCHEMA_VERSION, CONSENT_VERSION, STATUSES, PROFILE_FIELDS, INDEXES, USER_INDEXES,
  validateProfile, cleanSource, validateSection
}
