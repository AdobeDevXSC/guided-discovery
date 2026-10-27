// Scoring rules (lib/scoring-config.json) against the real question bank (fixture exported from
// assessment_questions). Run with: npm test
const { computeSummary } = require('../actions/lib/scoring')
const RULES = require('../actions/lib/scoring-config.json')['self-guided']
const BANK = require('./fixtures/self-guided-questions.json')

const docs = Object.fromEntries(RULES.sections.map((id) => [id, BANK[id] || {}]))
const items = BANK['data-foundations'].questions.find((q) => q.id === 'tracked').options.map((o) => o.id)
const score = (sections) => computeSummary(RULES, docs, sections)
const ids = (r) => r.matchedCapabilities.map((c) => c.id)
const tracked = (n) => ({ 'data-foundations': { answers: { tracked: items.slice(0, n) } } })

describe('self-guided scoring', () => {
  test('has the seven sections and 24 inventory items', () => {
    expect(RULES.sections).toEqual(['discovery', 'data-foundations', 'segmentation', 'identity', 'governance', 'roles', 'strategy-adoption'])
    expect(items).toHaveLength(24)
  })

  test('an empty response is early discovery, small, with no capabilities', () => {
    const r = score({})
    expect(r).toMatchObject({ readinessPct: 0, headline: 'early-discovery', engagement: 'small' })
    expect(r.matchedCapabilities).toEqual([])
  })

  test('headline bands: 60% or more migration-ready, 25% or more building your case', () => {
    expect(score(tracked(5)).headline).toBe('early-discovery') // 20.8%
    expect(score(tracked(6)).headline).toBe('building-your-case') // 25%
    expect(score(tracked(14)).headline).toBe('building-your-case') // 58.3%
    expect(score(tracked(15)).headline).toBe('migration-ready') // 62.5%
    expect(score(tracked(24)).readinessPct).toBe(1)
  })

  test('engagement size: small, then medium, then large', () => {
    expect(score(tracked(8)).engagement).toBe('small') // 0 capabilities, 33%
    expect(score(tracked(9)).engagement).toBe('medium') // 37.5%
    const six = { discovery: { answers: { needs: ['personalization', 'messaging', 'content-supply-chain', 'segmentation', 'brand-visibility', 'modernizing-docs'] } } }
    expect(ids(score(six)).length).toBeGreaterThan(5)
    expect(score({ ...six, ...tracked(16) }).engagement).toBe('medium') // 66.7% is under 67%
    expect(score({ ...six, ...tracked(17) }).engagement).toBe('large')
  })

  test('capabilities come from options, sort choices, AI picks and the identity upgrade', () => {
    const r = score({
      discovery: { answers: { needs: ['personalization'] } },
      governance: { answers: { status: ['consent:gap', 'data-labels:in-place'] } },
      identity: { answers: { 'identity-current': ['none'], 'identity-target': ['cross-channel'] } },
      'strategy-adoption': { answers: { 'ai-picks': ['content-analytics'] } }
    })
    const byId = Object.fromEntries(r.matchedCapabilities.map((c) => [c.id, c.reasons]))
    expect(byId['ai-capabilities']).toContainEqual({ section: 'discovery', question: 'needs', option: 'personalization' })
    expect(byId['data-transformations']).toEqual([{ section: 'governance', question: 'status', option: 'consent', choice: 'gap' }])
    expect(byId['graph-stitching']).toEqual([{ section: 'identity', question: 'identity-target', option: 'cross-channel', upgrade: true }])
    expect(byId['content-analytics']).toEqual([{ section: 'strategy-adoption', question: 'ai-picks', option: 'content-analytics' }])
  })

  test('a lower identity target unlocks nothing', () => {
    expect(score({ identity: { answers: { 'identity-current': ['unified-graph'], 'identity-target': ['none'] } } }).matchedCapabilities).toEqual([])
  })
})
