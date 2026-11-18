const { main } = require('../actions/assessment-download')

describe('assessment download action', () => {
  const savedNamespace = process.env.__OW_NAMESPACE
  const savedFetch = global.fetch
  let consoleError

  afterEach(() => {
    if (savedNamespace === undefined) delete process.env.__OW_NAMESPACE
    else process.env.__OW_NAMESPACE = savedNamespace
    global.fetch = savedFetch
    if (consoleError) consoleError.mockRestore()
  })

  test.each([
    ['self-guided', 'self-guided.html', 'aa-to-cja-self-guided.html'],
    ['facilitator', 'facilitator.html', 'aa-to-cja-facilitator.html']
  ])('serves the %s form as an environment-specific attachment', async (form, file, name) => {
    process.env.__OW_NAMESPACE = '20409-157ochretakin'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => `<!doctype html><script>const API_HOST_OUTSIDE_APP_BUILDER = 'https://stage.example';</script>`
    })

    const result = await main({ form })

    expect(global.fetch).toHaveBeenCalledWith(`https://20409-157ochretakin.adobeio-static.net/${file}`)
    expect(result.statusCode).toBe(200)
    expect(result.headers['Content-Disposition']).toBe(`attachment; filename="${name}"`)
    expect(result.body).toContain("const API_HOST_OUTSIDE_APP_BUILDER='https://20409-157ochretakin.adobeio-static.net';")
  })

  test('rejects unknown forms without requesting a page', async () => {
    global.fetch = jest.fn()

    const result = await main({ form: 'unknown' })
    const prototypeKeyResult = await main({ form: '__proto__' })

    expect(result.statusCode).toBe(400)
    expect(prototypeKeyResult.statusCode).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('returns an error when the environment cannot be determined', async () => {
    delete process.env.__OW_NAMESPACE
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    const result = await main({ form: 'self-guided' })

    expect(result.statusCode).toBe(500)
  })

  test('returns an error when the generated page cannot be fetched', async () => {
    process.env.__OW_NAMESPACE = '20409-157ochretakin-stage'
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 })
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    const result = await main({ form: 'facilitator' })

    expect(result.statusCode).toBe(502)
  })
})
