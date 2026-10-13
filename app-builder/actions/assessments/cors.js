// EDS sites are served at https://<branch>--<repo>--<org>.aem.page (preview) and .aem.live (production).
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9-]+--guided-discovery--adobedevxsc\.aem\.(page|live)$/
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
