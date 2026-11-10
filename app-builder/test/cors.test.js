// Which browser origins may call the public actions: the Adobe landing host, localhost, and this app's own
// static host, which comes from the runtime namespace so Stage and Production run the same code.
const cors = require('../actions/lib/cors')

describe('cors origins', () => {
  const saved = process.env.__OW_NAMESPACE
  afterEach(() => { if (saved === undefined) delete process.env.__OW_NAMESPACE; else process.env.__OW_NAMESPACE = saved })

  test('each environment allows its own host and not the other one', () => {
    process.env.__OW_NAMESPACE = '20409-157ochretakin-stage'
    expect(cors.isAllowedOrigin('https://20409-157ochretakin-stage.adobeio-static.net')).toBe(true)
    expect(cors.isAllowedOrigin('https://20409-157ochretakin.adobeio-static.net')).toBe(false)

    process.env.__OW_NAMESPACE = '20409-157ochretakin'
    expect(cors.isAllowedOrigin('https://20409-157ochretakin.adobeio-static.net')).toBe(true)
    expect(cors.isAllowedOrigin('https://20409-157ochretakin-stage.adobeio-static.net')).toBe(false)
  })

  test('the landing host and local development are always allowed, anything else is not', () => {
    delete process.env.__OW_NAMESPACE
    expect(cors.isAllowedOrigin('https://landing.adobe.com')).toBe(true)
    expect(cors.isAllowedOrigin('http://localhost:9080')).toBe(true)
    expect(cors.isAllowedOrigin('http://127.0.0.1:3000')).toBe(true)
    expect(cors.isAllowedOrigin('https://evil.example.com')).toBe(false)
    expect(cors.isAllowedOrigin('https://20409-157ochretakin.adobeio-static.net')).toBe(false) // no namespace known
    expect(cors.corsHeaders('https://evil.example.com')).toEqual({})
  })
})
