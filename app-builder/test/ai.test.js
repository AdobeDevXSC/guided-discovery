// What gets sent to AI: full question text and answer labels, no contact details. Run with: npm test
const ai = require('../actions/lib/ai')
const bank = require('./fixtures/self-guided-questions.json')

// the bank fixture as sectionsOf() returns it: Map sectionId -> { data: { sectionId, eyebrow, questions } }
const sectionsFrom = (fixture) => new Map(Object.entries(fixture).map(([id, data]) => [id, { data }]))

describe('ai input', () => {
  const sections = sectionsFrom(bank)
  const [first] = [...sections.values()]
  const q = first.data.questions.find((x) => (x.options || []).length)
  const response = {
    status: 'completed',
    completedAt: '2026-10-27T10:00:00Z',
    profile: { email: 'pat@example.com' },
    sections: { [first.data.sectionId]: { answers: { [q.id]: [q.options[0].id] } } },
    result: { readinessPct: 0.42, headline: 'building-your-case', engagement: 'medium', matchedCapabilities: [{ id: 'connected-data' }] }
  }
  const input = ai.buildInput({ assessment: 'self-guided', response, sections })

  test('every question is included with its full text, answered or not', () => {
    const total = [...sections.values()].reduce((n, s) => n + s.data.questions.length, 0)
    expect(input.match(/^Question: /gm)).toHaveLength(total)
    expect(input).toContain(`Question: ${q.title}\nAnswer: ${q.options[0].label}`)
    expect(input.match(/^Answer: Not answered$/gm)).toHaveLength(total - 1)
    expect(input).toContain(`## ${first.data.eyebrow}`)
  })

  test('the result is labelled from the scoring rules', () => {
    expect(input).toContain('Readiness: 42%')
    expect(input).toMatch(/Readiness band: \S/)
    expect(input).toMatch(/- Connected Data: /)
  })

  test('no contact details', () => {
    expect(input).not.toContain('pat@example.com')
  })

  test('the prompt follows the assessment', () => {
    expect(ai.userMessage('DATA', 'Summarize.')).toBe('<assessment>\nDATA\n</assessment>\n\nSummarize.')
  })

  test('a stuck analysis is reported as failed', () => {
    const old = { analysisId: 'a', status: 'running', createdAt: '2026-10-27T10:00:00Z' }
    expect(ai.publicAnalysis(old, Date.parse('2026-10-27T10:05:00Z')).status).toBe('running')
    expect(ai.publicAnalysis(old, Date.parse('2026-10-27T11:00:00Z'))).toMatchObject({ status: 'failed', error: expect.stringMatching(/did not finish/) })
  })
})
