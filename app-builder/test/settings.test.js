// Settings page storage: API key encryption and validation, prompt validation. Run with: npm test
const crypto = require('crypto')
const settings = require('../actions/lib/settings')

const pair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 })
  return {
    pub: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    priv: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
  }
}
const KEYS = pair()
const API_KEY = 'sk-ant-api03-' + 'a'.repeat(80) + 'WXYZ'

describe('settings', () => {
  test('the API key is encrypted with the public key and only the private key decrypts it', () => {
    const { set, errors } = settings.validateAi({ apiKey: ` ${API_KEY} ` }, KEYS.pub)
    expect(errors).toEqual({})
    expect(set.apiKeyHint).toBe('WXYZ')
    expect(set.apiKey.alg).toBe('rsa-oaep-256')
    expect(JSON.stringify(set)).not.toContain('sk-ant')
    expect(settings.decrypt(set.apiKey, KEYS.priv)).toBe(API_KEY)
    expect(() => settings.decrypt(set.apiKey, pair().priv)).toThrow()
  })

  test('without a public key the API key is refused, not stored in plain text', () => {
    const r = settings.validateAi({ apiKey: API_KEY }, '')
    expect(r.errors.apiKey).toMatch(/no encryption key/)
    expect(r.set).toEqual({})
  })

  test('clearKey removes the saved key; other input is checked', () => {
    expect(settings.validateAi({ clearKey: true }, KEYS.pub)).toEqual({ set: {}, unset: { apiKey: '', apiKeyHint: '' }, errors: {} })
    expect(settings.validateAi({ apiKey: '' }, KEYS.pub).errors).toEqual({ apiKey: 'required' })
    expect(settings.validateAi({ apiKey: 'sk-proj-123' }, KEYS.pub).errors.apiKey).toMatch(/sk-ant-/)
    expect(settings.validateAi({ apiKey: 'sk-ant-' + 'a'.repeat(400) }, KEYS.pub).errors).toEqual({ apiKey: 'too long' })
  })

  test('the public view never includes the key', () => {
    const { set } = settings.validateAi({ apiKey: API_KEY }, KEYS.pub)
    const view = settings.publicAi({ ...set, updatedAt: 'u', updatedBy: 'e' })
    expect(view).toEqual({ provider: 'anthropic', hasKey: true, keyHint: 'WXYZ', updatedAt: 'u', updatedBy: 'e' })
    expect(settings.publicAi(null)).toMatchObject({ hasKey: false, keyHint: '' })
  })

  test('prompt validation', () => {
    expect(settings.validatePrompt({ name: '', text: '' }).errors).toEqual({ name: 'required', text: 'required' })
    expect(settings.validatePrompt({ name: 'Summary', text: 'x'.repeat(20001) }).errors).toEqual({ text: 'at most 20,000 characters' })
    expect(settings.validatePrompt({ promptId: 'nope', name: 'a', text: 'b' }).errors).toEqual({ promptId: 'invalid prompt id' })
    expect(settings.validatePrompt({ name: ' Summary ', text: 'line 1\r\nline 2' })).toMatchObject({ name: 'Summary', text: 'line 1\nline 2', errors: {} })
  })

  test('the public prompt view keeps only the prompt fields', () => {
    const doc = { _id: 'x', promptId: 'p', name: 'n', text: 't', createdAt: 'c', updatedAt: 'u', updatedBy: 'e' }
    expect(settings.publicPrompt(doc)).toEqual({ promptId: 'p', name: 'n', text: 't', createdAt: 'c', updatedAt: 'u', updatedBy: 'e' })
  })
})
