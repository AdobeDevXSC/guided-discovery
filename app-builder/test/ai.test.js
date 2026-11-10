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
    expect(input).toContain(`Question: ${q.title}\n${q.help ? `Help text: ${q.help}\n` : ''}Answer: ${q.options[0].label}`)
    expect(input.match(/^Answer: Not answered$/gm)).toHaveLength(total - 1)
    expect(input).toContain(`## ${first.data.eyebrow}`)
  })

  test('an answered question lists the options that were not picked', () => {
    const rest = q.options.slice(1).map((o) => `- ${o.label}`).join('\n')
    expect(input).toContain(`Answer: ${q.options[0].label}\nNot selected:\n${rest}\n`)
    expect(input.match(/^Not selected:$/gm)).toHaveLength(1)
  })

  test('help text follows its question, only when the question has one', () => {
    const all = [...sections.values()].flatMap((s) => s.data.questions)
    const withHelp = all.filter((x) => x.help)
    expect(withHelp.length).toBeGreaterThan(0)
    expect(input.match(/^Help text: /gm)).toHaveLength(withHelp.length)
    for (const x of withHelp) expect(input).toContain(`Question: ${x.title}\nHelp text: ${x.help}\n`)
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

  test('Bedrock 403s are reported as a rejected key or as missing model access', () => {
    const Anthropic = require('@anthropic-ai/sdk')
    const denied = (Message) => new Anthropic.PermissionDeniedError(403, { Message }, `403 ${Message}`, new Headers())
    expect(ai.failureText(denied('Authentication failed: Please make sure your API Key is valid.'))).toMatch(/^The API key was rejected by Amazon Bedrock/)
    expect(ai.failureText(denied("You don't have access to the model with the specified model ID."))).toMatch(/not allowed to use us\.anthropic\.claude-sonnet-5-5 in us-east-2/)
  })
})

describe('wrap-up skill with resource files', () => {
  const settings = require('../actions/lib/settings')
  test('resources follow the instructions, each labelled with its path', () => {
    const text = settings.skillSystemText({ text: 'Do it.', files: [{ path: 'references/a.md', text: 'AAA' }] })
    expect(text.startsWith('Do it.')).toBe(true)
    expect(text).toContain('<resource path="references/a.md">\nAAA\n</resource>')
    expect(settings.skillSystemText({ text: 'Do it.' })).toBe('Do it.')
  })
  test('unsafe, duplicate and oversized resources are rejected', () => {
    const ok = settings.validateSkill({ name: 'n', text: 't', files: [{ path: 'a/b.md', text: 'x' }] })
    expect(ok.errors).toEqual({})
    expect(ok.files).toEqual([{ path: 'a/b.md', text: 'x' }])
    expect(settings.validateSkill({ name: 'n', text: 't', files: [{ path: '../x.md', text: 'x' }] }).errors.files).toBeTruthy()
    expect(settings.validateSkill({ name: 'n', text: 't', files: [{ path: 'a.md', text: 'x' }, { path: 'a.md', text: 'y' }] }).errors.files).toBeTruthy()
    expect(settings.validateSkill({ name: 'n', text: 't', files: [{ path: 'a.md', text: 'x'.repeat(100001) }] }).errors.files).toBeTruthy()
  })
})

describe('guide PDF', () => {
  test('Markdown becomes a PDF, tables, lists and odd characters included', async () => {
    const { markdownToPdf } = require('../actions/lib/pdf')
    const buf = await markdownToPdf('# Title\n\nText with **bold** and a → arrow ☃.\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |\n', { footer: 'Guide' })
    expect(buf.slice(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(1000)
  })
})

describe('wrap-up template', () => {
  const tpl = require('../actions/lib/template')
  const T = '<h1>{{headline}}</h1><p>{{computed.company}} {{computed.readinessPct}}%</p>{{#each priorities}}<li>{{add @index 1}}. {{title}}: {{detail}}</li>{{/each}}{{#each steps}}<i>{{this}}</i>{{/each}}{{#if note}}<em>{{note}}</em>{{/if}}'
  test('the fields Claude fills are listed, computed ones are not', () => {
    expect(tpl.skeleton(T)).toEqual({ headline: '<headline>', priorities: [{ title: '<title>', detail: '<detail>' }], steps: ['<steps>'], note: '<note>' })
  })
  test('filled with escaped text and computed facts', () => {
    const html = tpl.render(T, { headline: 'A <b>big</b> win', priorities: [{ title: 'One', detail: 'x' }, { title: 'Two', detail: 'y' }], steps: ['go'], computed: { company: 'HACK' } }, { company: 'Acme', readinessPct: 62 })
    expect(html).toContain('<h1>A &lt;b&gt;big&lt;/b&gt; win</h1>')
    expect(html).toContain('Acme 62%')
    expect(html).toContain('1. One: x')
    expect(html).toContain('2. Two: y')
    expect(html).toContain('<i>go</i>')
  })
  test('raw output and broken templates are refused', () => {
    expect(() => tpl.check('{{{headline}}}')).toThrow(/raw output/)
    expect(() => tpl.check('{{#each a}}no end')).toThrow(/template error/)
  })
  test('Claude\'s reply can be fenced or have text around it', () => {
    expect(tpl.extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(tpl.extractJson('Here you go: {"a":{"b":2}} done')).toEqual({ a: { b: 2 } })
    expect(() => tpl.extractJson('no json here')).toThrow()
  })
})

describe('wrap-up template helpers and hints', () => {
  const tpl = require('../actions/lib/template')
  const T = '{{!-- field kind: "existing" or "proposed" --}}{{#each nodes}}{{!-- field kind: "existing" or "proposed" --}}<b class="{{#if (eq kind "proposed")}}dash{{/if}}">{{text}}</b>{{/each}}{{!-- field tags: a short label --}}{{#each tags}}{{this}}{{/each}}'
  test('a hint replaces the placeholder and a comparison works', () => {
    expect(tpl.skeleton(T)).toEqual({ nodes: [{ kind: '"existing" or "proposed"', text: '<text>' }], tags: ['a short label'] })
    const html = tpl.render(T, { nodes: [{ kind: 'Proposed', text: 'x' }, { kind: 'existing', text: 'y' }], tags: [] }, {})
    expect(html).toBe('<b class="dash">x</b><b class="">y</b>')
  })
})

describe('wrap-up deck template', () => {
  const fs = require('fs')
  const tpl = require('../actions/lib/template')
  const text = fs.readFileSync(`${__dirname}/../templates/analytics-modernization-deck.html`, 'utf8')
  const sample = JSON.parse(fs.readFileSync(`${__dirname}/../templates/analytics-modernization-deck.sample.json`, 'utf8'))

  test('the sample answer fills every slide of the deck', () => {
    const html = tpl.render(text, sample, { company: 'Acme & Sons' })
    expect(html.match(/class="slide-wrap"/g)).toHaveLength(20)
    expect(html).toContain('Acme &amp; Sons | Analytics modernization assessment')
    expect(html).not.toMatch(/\{\{|undefined/)
    expect(html).toContain('<span class="lvl l2">')
    expect(html).toContain('class="node prop"')
  })
  test('the fields asked of Claude match the sample, and computed facts are not among them', () => {
    expect(Object.keys(tpl.skeleton(text)).sort()).toEqual(Object.keys(sample).sort())
    expect(tpl.outputInstructions(text)).not.toContain('computed')
  })
  test('a deck inside a code fence is unwrapped, notes after it are dropped', () => {
    const ai = require('../actions/lib/ai')
    expect(ai.unfenceHtml('```html\n<!DOCTYPE html><html></html>\n```\n\nNotes: x')).toBe('<!DOCTYPE html><html></html>')
    expect(ai.unfenceHtml('```js\nconsole.log(1)\n```')).toBe('```js\nconsole.log(1)\n```')
  })
})
