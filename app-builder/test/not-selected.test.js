// Unpicked options in the answers APIs: listed for answered questions, by display type. Run with: npm test
const questions = require('../actions/lib/questions')
const fixture = require('./fixtures/self-guided-questions.json')

const qOf = (section, id) => fixture[section].questions.find((q) => q.id === id)
const ids = (list) => list.map((o) => o.value)

describe('notSelected', () => {
  test('multi-select: every option not picked, in page order, with its label', () => {
    const q = qOf('data-foundations', 'tracked')
    const out = questions.notSelected(q, ['evar-product', 'segments'], fixture['data-foundations'].questions, {})
    expect(out).toHaveLength(q.options.length - 2)
    expect(ids(out)).toEqual(q.options.map((o) => o.id).filter((id) => !['evar-product', 'segments'].includes(id)))
    expect(out[0]).toEqual({ value: q.options[1].id, label: q.options[1].label })
  })

  test('per-item: only items picked in the source question that got no answer', () => {
    const q = qOf('data-foundations', 'quantity')
    const given = { tracked: ['evar-product', 'segments', 'anomaly'] }
    expect(ids(questions.notSelected(q, ['segments:one'], fixture['data-foundations'].questions, given))).toEqual(['evar-product', 'anomaly'])
  })

  test('sort and owner questions: options not sorted or given no owner', () => {
    const status = qOf('governance', 'status')
    expect(ids(questions.notSelected(status, ['consent:gap', 'data-labels:in-place'], [], {}))).toEqual(status.options.map((o) => o.id).filter((id) => !['consent', 'data-labels'].includes(id)))
    const owners = qOf('roles', 'owners')
    const [a, b] = owners.options.map((o) => o.id)
    expect(ids(questions.notSelected(owners, [`${a}=Pat Lee`, `${b}:follow-up`], [], {}))).toEqual(owners.options.slice(2).map((o) => o.id))
  })

  test('unanswered or unknown questions list nothing', () => {
    expect(questions.notSelected(qOf('discovery', 'focus'), [], [], {})).toEqual([])
    expect(questions.notSelected(undefined, ['x'], [], {})).toEqual([])
  })

  test('the answer sheet carries notSelected on each question', () => {
    const bank = new Map(Object.entries(fixture).map(([id, data]) => [id, { data }]))
    const sheet = questions.answerSheet(bank, { discovery: { answers: { focus: ['both'] } } })
    const focus = sheet[0].questions.find((q) => q.question === 'focus')
    expect(ids(focus.notSelected)).toEqual(qOf('discovery', 'focus').options.map((o) => o.id).filter((id) => id !== 'both'))
    expect(sheet[0].questions.find((q) => q.question === 'needs').notSelected).toEqual([])
  })
})
