// Settings page storage: encryption of the AI client secret and validation. Run with: npm test
const crypto = require('crypto')
const settings = require('../actions/lib/settings')

const KEY = crypto.randomBytes(32).toString('base64')

describe('settings', () => {
  test('the client secret round-trips and is not readable in storage', () => {
    const box = settings.encrypt('my-secret-1234', KEY)
    expect(box.alg).toBe('aes-256-gcm')
    expect(JSON.stringify(box)).not.toContain('my-secret')
    expect(settings.decrypt(box, KEY)).toBe('my-secret-1234')
  })

  test('tampered or wrongly keyed ciphertext is rejected', () => {
    const box = settings.encrypt('my-secret-1234', KEY)
    expect(() => settings.decrypt({ ...box, data: Buffer.from('nope').toString('base64') }, KEY)).toThrow()
    expect(() => settings.decrypt(box, crypto.randomBytes(32).toString('base64'))).toThrow()
  })

  test('a new secret is encrypted with a hint; an empty one keeps the saved secret; clearSecret removes it', () => {
    const saved = settings.validateAi({ clientId: 'abc', clientSecret: 'secret-WXYZ' }, KEY)
    expect(saved.errors).toEqual({})
    expect(saved.set.secretHint).toBe('WXYZ')
    expect(settings.decrypt(saved.set.secret, KEY)).toBe('secret-WXYZ')
    expect(settings.validateAi({ clientId: 'abc', clientSecret: '' }, KEY).set).toEqual({ clientId: 'abc' })
    expect(settings.validateAi({ clientId: 'abc', clearSecret: true }, KEY).unset).toEqual({ secret: '', secretHint: '' })
  })

  test('without a 32-byte key the secret is refused, not stored in plain text', () => {
    const r = settings.validateAi({ clientId: 'abc', clientSecret: 'x' }, '')
    expect(r.errors.clientSecret).toMatch(/no encryption key/)
    expect(r.set.secret).toBeUndefined()
  })

  test('the public view never includes the secret', () => {
    const doc = { clientId: 'abc', secret: settings.encrypt('s3cret', KEY), secretHint: 'cret' }
    const view = settings.publicAi(doc)
    expect(view).toEqual({ clientId: 'abc', hasSecret: true, secretHint: 'cret', updatedAt: null, updatedBy: '' })
    expect(JSON.stringify(view)).not.toContain('s3cret')
  })

  test('validation', () => {
    expect(settings.validateAi({ clientId: 'has space' }, KEY).errors).toEqual({ clientId: 'no spaces' })
    expect(settings.validatePrompt({ name: '', text: '' }).errors).toEqual({ name: 'required', text: 'required' })
    expect(settings.validatePrompt({ name: 'Summary', text: 'x'.repeat(20001) }).errors).toEqual({ text: 'at most 20,000 characters' })
    expect(settings.validatePrompt({ promptId: 'nope', name: 'a', text: 'b' }).errors).toEqual({ promptId: 'invalid prompt id' })
    expect(settings.validatePrompt({ name: ' Summary ', text: 'line 1\r\nline 2' })).toMatchObject({ name: 'Summary', text: 'line 1\nline 2', errors: {} })
  })
})
