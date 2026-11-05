// A scored result with labels next to its IDs, for the answers APIs and the AI input: the readiness
// band and its next steps, the engagement size, and each matched capability with its description and
// the answers that matched it (section, question and option text from the question bank). Labels
// come from the scoring rules (scoring-config.json); the stored result keeps IDs only.
const questions = require('./questions')
const SCORING = require('./scoring-rules')

const byId = (list, id) => (list || []).find((x) => x.id === id) || null

/** One reason a capability matched, labelled from the bank ({ section, question, option, choice? }). */
function labelReason (bank, reason) {
  const entry = bank && bank.get(reason.section)
  const qs = entry ? entry.data.questions : []
  const q = qs.find((x) => x.id === reason.question)
  const value = reason.choice ? `${reason.option}:${reason.choice}` : reason.option
  const v = questions.labelValue(q, value, qs)
  return {
    ...reason,
    sectionTitle: entry ? entry.data.eyebrow || reason.section : reason.section,
    questionText: q ? q.title || '' : '',
    optionLabel: v.optionLabel || v.label || reason.option,
    ...(reason.choice ? { choiceLabel: v.choiceLabel || reason.choice } : {})
  }
}

/**
 * The result with labels added; IDs are kept. `bank` is the question bank as sectionsOf() returns
 * it (Map sectionId -> { data }); without it, reasons keep their IDs as labels.
 */
function labelResult (assessment, result, bank) {
  if (!result) return null
  const rules = SCORING[assessment] || {}
  const headline = byId(rules.headlines, result.headline)
  const size = byId(rules.sizes, result.engagement)
  return {
    ...result,
    readinessLabel: typeof result.readinessPct === 'number' ? `${Math.round(result.readinessPct * 100)}%` : '',
    headlineLabel: headline ? headline.label : result.headline || '',
    nextSteps: headline ? (headline.steps || []).map((s) => ({ title: s.title, text: s.text })) : [],
    engagementDetail: size
      ? { label: size.label, title: size.title, duration: size.duration, model: size.model, text: size.text }
      : null,
    matchedCapabilities: (result.matchedCapabilities || []).map((c) => {
      const cap = byId(rules.capabilities, c.id)
      return {
        ...c,
        label: cap ? cap.label : c.id,
        description: cap ? cap.description : '',
        reasons: (c.reasons || []).map((r) => labelReason(bank, r))
      }
    })
  }
}

module.exports = { labelResult }
