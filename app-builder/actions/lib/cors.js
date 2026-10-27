// Browser origins allowed to call the public actions.
const ALLOWED_ORIGIN_PATTERNS = [
  // the Adobe landing-page host
  /^https:\/\/landing\.adobe\.com$/,
  // this app's own static host (Stage), which serves the public self-guided.html page
  /^https:\/\/20409-157ochretakin-stage\.adobeio-static\.net$/,
  // local development (e.g. Live Server or aio app run) on localhost or 127.0.0.1 (Origin is spoofable
  // by non-browsers anyway, so this adds no exposure)
  /^http:\/\/localhost:\d{2,5}$/,
  /^http:\/\/127\.0\.0\.1:\d{2,5}$/
]

const isAllowedOrigin = origin => typeof origin === 'string' && ALLOWED_ORIGIN_PATTERNS.some(re => re.test(origin))

const originOf = params => {
  const h = params.__ow_headers || {}
  return h.origin || h.Origin || ''
}

// Headers for an allowed origin; empty for anything else so browsers block the response.
function corsHeaders (origin) {
  if (!isAllowedOrigin(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin'
  }
}

module.exports = { isAllowedOrigin, originOf, corsHeaders }

const jsonHeaders = { 'Content-Type': 'application/json' }

// Wraps a web action handler with the CORS gate: answers preflight for allowed origins,
// rejects requests carrying a disallowed Origin (400; a 403 is rewritten by the CDN into a 503),
// and adds the CORS headers to every response. Requests with no Origin (server-side, curl) are
// not browser traffic and pass through; CORS cannot protect against those.
function withCors (handler) {
  return async function main (params) {
    const origin = originOf(params)
    const cors = corsHeaders(origin)
    const method = (params.__ow_method || 'get').toLowerCase()

    if (method === 'options') {
      return { statusCode: cors['Access-Control-Allow-Origin'] ? 204 : 400, headers: cors, body: '' }
    }
    if (origin && !isAllowedOrigin(origin)) {
      return { statusCode: 400, headers: jsonHeaders, body: { ok: false, error: 'origin not allowed' } }
    }
    const res = await handler(params)
    return { ...res, headers: { ...res.headers, ...cors } }
  }
}

module.exports.withCors = withCors
