// Result labels in the answers APIs: IDs are kept, labels come from the scoring rules and the bank. Run with: npm test
const { labelResult } = require('../actions/lib/result')
const fixture = require('./fixtures/self-guided-questions.json')
const SCORING = require('../actions/lib/scoring-config.json')['self-guided']

const bank = new Map(Object.entries(fixture).map(([id, data]) => [id, { data }]))
const result = {
  readinessPct: 0.292,
  headline: 'building-your-case',
  engagement: 'medium',
  matchedCapabilities: [
    { id: 'data-transformations', reasons: [{ section: 'discovery', question: 'needs', option: 'modernizing-docs' }, { section: 'governance', question: 'status', option: 'consent', choice: 'gap' }] }
  ],
  computedAt: 'c'
}

describe('labelResult', () => {
  const out = labelResult('self-guided', result, bank)

  test('keeps the stored IDs and adds the band, next steps and engagement', () => {
    expect(out).toMatchObject({ readinessPct: 0.292, headline: 'building-your-case', engagement: 'medium', computedAt: 'c', readinessLabel: '29%' })
    const band = SCORING.headlines.find((h) => h.id === 'building-your-case')
    expect(out.headlineLabel).toBe(band.label)
    expect(out.nextSteps).toEqual(band.steps.map((s) => ({ title: s.title, text: s.text })))
    const size = SCORING.sizes.find((s) => s.id === 'medium')
    expect(out.engagementDetail).toEqual({ label: size.label, title: size.title, duration: size.duration, model: size.model, text: size.text })
  })

  test('each capability gets its label and description, each reason its question and option text', () => {
    const [cap] = out.matchedCapabilities
    const rule = SCORING.capabilities.find((c) => c.id === 'data-transformations')
    expect(cap).toMatchObject({ id: 'data-transformations', label: rule.label, description: rule.description })
    expect(cap.reasons[0]).toEqual({
      section: 'discovery', question: 'needs', option: 'modernizing-docs',
      sectionTitle: fixture.discovery.eyebrow,
      questionText: "What's really driving this?",
      optionLabel: 'Modernizing documents & reporting'
    })
    expect(cap.reasons[1]).toMatchObject({ option: 'consent', choice: 'gap', questionText: 'Sort each control', optionLabel: 'Consent & Identity Governance', choiceLabel: 'Gap for us' })
  })

  test('no result stays null; unknown IDs fall back to the ID', () => {
    expect(labelResult('self-guided', null, bank)).toBeNull()
    const odd = labelResult('self-guided', { headline: 'x', engagement: 'y', matchedCapabilities: [{ id: 'z', reasons: [{ section: 'q', question: 'w', option: 'e' }] }] }, bank)
    expect(odd).toMatchObject({ headlineLabel: 'x', nextSteps: [], engagementDetail: null, readinessLabel: '' })
    expect(odd.matchedCapabilities[0]).toMatchObject({ label: 'z', description: '', reasons: [{ sectionTitle: 'q', questionText: '', optionLabel: 'e' }] })
  })
})
