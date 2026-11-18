const guide = require('../actions/lib/guide')
const ai = require('../actions/lib/ai')
const settings = require('../actions/lib/settings')

describe('shared guide request', () => {
  test('selects one prompt deterministically for both entry points', () => {
    const prompts = [
      { promptId: 'b', name: 'Zebra', text: 'z' },
      { promptId: 'c', name: 'Alpha', text: 'c' },
      { promptId: 'a', name: 'Alpha', text: 'a' }
    ]

    expect(guide.sharedPrompt(prompts)).toEqual(prompts[2])
    expect(guide.sharedPrompt([])).toBeNull()
  })

  test('uses the shared prompt, skill/resources, template and filtered profile in one request', () => {
    const request = guide.prepare({
      assessment: 'self-guided',
      response: {
        completedAt: '2026-10-27T10:00:00Z',
        sections: {},
        result: { readinessPct: 0.42, engagement: 'medium', matchedCapabilities: [] }
      },
      profile: { organization: 'Example Co', role: 'Analyst', email: 'person@example.com' },
      sections: new Map(),
      skill: { name: 'Guide skill', text: 'Follow the guide.', files: [{ path: 'references/guide.md', text: 'Reference details.' }] },
      prompt: { promptId: 'prompt-1', name: 'Shared guide', text: 'Create the assessment guide.' },
      template: { text: '<h1>{{headline}}</h1><p>{{computed.company}}</p>' }
    })

    expect(request).toMatchObject({
      promptId: 'prompt-1',
      promptName: 'Shared guide',
      promptText: 'Create the assessment guide.',
      skillName: 'Guide skill',
      templateText: '<h1>{{headline}}</h1><p>{{computed.company}}</p>',
      computed: { company: 'Example Co', readinessPct: 42 }
    })
    expect(request.systemText).toContain('Follow the guide.')
    expect(request.systemText).toContain('references/guide.md')
    expect(request.systemText).toContain('## Output format')
    expect(request.input).toContain('Organization: Example Co')
    expect(request.input).toContain('Role: Analyst')
    expect(request.input).not.toContain('person@example.com')
  })

  test('falls back to the existing built-in prompt when Settings has none', () => {
    const request = guide.prepare({
      assessment: 'self-guided',
      response: { sections: {}, result: {} },
      profile: null,
      sections: new Map(),
      skill: { name: 'Guide skill', text: 'Follow the guide.' },
      prompt: null,
      template: null
    })

    expect(request.promptText).toBe(ai.WRAPUP_PROMPT)
    expect(request.promptName).toBe('Wrap-up guide')
    expect(request.systemText).toBe(settings.skillSystemText({ name: 'Guide skill', text: 'Follow the guide.' }))
    expect(request).not.toHaveProperty('templateText')
  })
})
