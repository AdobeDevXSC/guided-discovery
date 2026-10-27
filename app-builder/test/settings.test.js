// Settings page storage: prompt validation. Run with: npm test
const settings = require('../actions/lib/settings')

describe('settings', () => {
  test('prompt validation', () => {
    expect(settings.validatePrompt({ name: '', text: '' }).errors).toEqual({ name: 'required', text: 'required' })
    expect(settings.validatePrompt({ name: 'Summary', text: 'x'.repeat(20001) }).errors).toEqual({ text: 'at most 20,000 characters' })
    expect(settings.validatePrompt({ promptId: 'nope', name: 'a', text: 'b' }).errors).toEqual({ promptId: 'invalid prompt id' })
    expect(settings.validatePrompt({ name: ' Summary ', text: 'line 1\r\nline 2' })).toMatchObject({ name: 'Summary', text: 'line 1\nline 2', errors: {} })
  })

  test('the public view keeps only the prompt fields', () => {
    const doc = { _id: 'x', promptId: 'p', name: 'n', text: 't', createdAt: 'c', updatedAt: 'u', updatedBy: 'e' }
    expect(settings.publicPrompt(doc)).toEqual({ promptId: 'p', name: 'n', text: 't', createdAt: 'c', updatedAt: 'u', updatedBy: 'e' })
  })
})
