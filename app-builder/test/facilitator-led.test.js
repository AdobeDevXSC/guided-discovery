// The facilitator-led assessment: its own id, the self-guided scoring rules, and a required view.
const assert = require('assert')
const SCORING = require('../actions/lib/scoring-rules')
const CONFIG = require('../actions/lib/scoring-config.json')
const { ASSESSMENT_IDS } = require('../actions/assessments/schema')
const { validateView } = require('../actions/guided-discovery/schema')
const ai = require('../actions/lib/ai')

test('facilitator-led is a known assessment scored with the self-guided rules', () => {
  assert.ok(ASSESSMENT_IDS.includes('facilitator-led'))
  assert.strictEqual(SCORING['facilitator-led'], CONFIG['self-guided'])
  assert.strictEqual(SCORING['self-guided'], CONFIG['self-guided'])
})

test('facilitator-led needs a view; self-guided takes none', () => {
  assert.deepStrictEqual(validateView('facilitator-led', 'executive'), { view: 'executive' })
  assert.deepStrictEqual(validateView('facilitator-led', 'practitioner'), { view: 'practitioner' })
  assert.ok(validateView('facilitator-led', undefined).error)
  assert.ok(validateView('facilitator-led', 'selfguided').error)
  assert.deepStrictEqual(validateView('self-guided', undefined), { view: null })
  assert.ok(validateView('self-guided', 'executive').error)
})

test('the AI input names the assessment and the session view', () => {
  const text = ai.buildInput({
    assessment: 'facilitator-led',
    response: { status: 'completed', view: 'executive', sections: {}, result: null },
    sections: new Map()
  })
  assert.match(text, /^Assessment: .*facilitator-led assessment \(executive session\)$/m)
})
