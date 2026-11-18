const DOWNLOADS = {
  'self-guided': {
    file: 'self-guided.html',
    name: 'aa-to-cja-self-guided.html'
  },
  facilitator: {
    file: 'facilitator.html',
    name: 'aa-to-cja-facilitator.html'
  }
}

const errorHeaders = { 'Content-Type': 'text/plain; charset=utf-8' }

async function main (params) {
  const method = (params.__ow_method || 'get').toLowerCase()
  if (method !== 'get') {
    return { statusCode: 405, headers: { ...errorHeaders, Allow: 'GET' }, body: 'Method not allowed' }
  }

  const download = Object.hasOwn(DOWNLOADS, params.form) ? DOWNLOADS[params.form] : null
  if (!download) {
    return { statusCode: 400, headers: errorHeaders, body: 'Unknown assessment form' }
  }

  const namespace = process.env.__OW_NAMESPACE
  if (!namespace || !/^[a-z0-9-]+$/.test(namespace)) {
    console.error('Assessment download unavailable: invalid runtime namespace')
    return { statusCode: 500, headers: errorHeaders, body: 'Assessment download is unavailable' }
  }

  const host = `https://${namespace}.adobeio-static.net`
  try {
    const response = await fetch(`${host}/${download.file}`)
    if (!response.ok) throw new Error(`static page request returned ${response.status}`)

    let html = await response.text()
    const apiHostLine = /const\s+API_HOST_OUTSIDE_APP_BUILDER\s*=\s*(['"])[^'"]+\1\s*;/
    if ((html.match(/const\s+API_HOST_OUTSIDE_APP_BUILDER\s*=/g) || []).length !== 1) {
      throw new Error(`expected one external API host setting in ${download.file}`)
    }
    html = html.replace(apiHostLine, `const API_HOST_OUTSIDE_APP_BUILDER='${host}';`)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${download.name}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      },
      body: html
    }
  } catch (error) {
    console.error(`Assessment download failed for ${download.file}:`, error)
    return { statusCode: 502, headers: errorHeaders, body: 'Unable to prepare assessment download' }
  }
}

exports.main = main
