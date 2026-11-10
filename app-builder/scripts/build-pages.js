#!/usr/bin/env node
// Builds the two hosted assessment pages from the guided discovery master:
//   web-src/self-guided.html  the master as it is (VIEW_PROFILE "selfguided"), saves as "self-guided"
//   web-src/facilitator.html  the facilitator-led page: ?view=executive or ?view=practitioner (default
//                             practitioner) picks the version; saves as "facilitator-led" with that view
// Both also get the App Builder additions: an API base that follows the environment serving the page, and the
// wrap-up guide code (web-src/wrapup-guide.snippet.js). Never edit web-src/*.html by hand: change the master
// (pages-master/guided-discovery.html) or this script and run
//
//   node scripts/build-pages.js [master.html]        (default: pages-master/guided-discovery.html)
//
// Every edit must match exactly once, so a master that changed shape fails loudly instead of producing a page
// that saves to the wrong place.
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const MASTER = path.join(ROOT, 'pages-master', 'guided-discovery.html')
const SNIPPET = path.join(ROOT, 'web-src', 'wrapup-guide.snippet.js')

function replaceOnce (html, from, to) {
  const count = html.split(from).length - 1
  if (count !== 1) throw new Error(`expected exactly one match, found ${count}: ${from.slice(0, 80)}`)
  return html.replace(from, () => to)
}

// The API of the environment serving the page. Served from App Builder (*.adobeio-static.net) it uses its own host;
// hosted anywhere else (localhost, landing.adobe.com, ...) it uses API_HOST_OUTSIDE_APP_BUILDER: Stage unless changed.
const BASE_LINE = [
  "const API_HOST_OUTSIDE_APP_BUILDER='https://20409-157ochretakin-stage.adobeio-static.net'; // when hosted outside App Builder: set to https://20409-157ochretakin.adobeio-static.net for production",
  "const BASE=(location.hostname.endsWith('.adobeio-static.net')?location.origin:API_HOST_OUTSIDE_APP_BUILDER)+'/api/v1/web/marketingprototype';"
].join('\n')
const MASTER_BASE = "const BASE='https://20409-157ochretakin-stage.adobeio-static.net/api/v1/web/marketingprototype';"
// the end of the App Builder sync block in the master: the wrap-up code goes just before it
const SYNC_END = '\n})();\n</script>\n</body>'
// The wrap-up code is wrapped in markers so a master that already carries it (e.g. the updated master handed back
// for hosting) is accepted: the block between the markers is replaced, never added twice.
const WRAP_START = '/* >>> app-builder wrap-up: managed by scripts/build-pages.js, do not edit here (source: web-src/wrapup-guide.snippet.js) */'
const WRAP_END = '/* <<< app-builder wrap-up */'

function applyWrapUp (html, snippet) {
  const block = `${WRAP_START}\n${snippet.trim()}\n${WRAP_END}`
  const a = html.indexOf(WRAP_START)
  if (a >= 0) {
    if (html.split(WRAP_START).length !== 2 || html.split(WRAP_END).length !== 2) throw new Error('the wrap-up markers in the master are not a single pair')
    return html.slice(0, a) + block + html.slice(html.indexOf(WRAP_END) + WRAP_END.length)
  }
  return replaceOnce(html, SYNC_END, `\n${block}\n${SYNC_END.slice(1)}`)
}

// the API base line in the master: the original one, or the one this script writes
const baseAnchor = (html) => (html.includes(BASE_LINE) ? BASE_LINE : MASTER_BASE)

function withAppBuilderAdditions (html, snippet) {
  html = replaceOnce(html, baseAnchor(html), BASE_LINE)
  return applyWrapUp(html, snippet)
}

function selfGuided (master, snippet) {
  return { file: 'self-guided.html', html: withAppBuilderAdditions(master, snippet) }
}

function facilitator (master, snippet) {
  const file = 'facilitator.html'
  const edits = [
    [/<title>([^<]*)<\/title>/, (m, t) => `<title>${t} · Facilitator session</title>`],
    ['const VIEW_PROFILE = "selfguided";',
      `/* FACILITATOR-LED PAGE (web-src/${file}), built by scripts/build-pages.js; edit the master and rebuild instead
   of editing this one. Saves as assessment "facilitator-led" with the view from the link: ?view=executive or
   ?view=practitioner (default). The contact form is shown here too, so each session is linked to the client's profile. */
const VIEW_PROFILE = new URLSearchParams(location.search).get('view') === 'executive' ? 'executive' : 'practitioner';`],
    ['let GATE_PASSED = (VIEW_PROFILE !== "selfguided"); // facilitator-led profiles skip the gate entirely',
      'let GATE_PASSED = false; // facilitator-led pages show the contact form too: answers are saved against that profile'],
    ["  if(VIEW_PROFILE==='selfguided'){\n    payload.lead =", '  if(LEAD.email){\n    payload.lead ='],
    ["  if(VIEW_PROFILE==='selfguided'){\n    const fullName", '  if(LEAD.email){\n    const fullName'],
    ["  if(VIEW_PROFILE==='selfguided' && !LEAD.email){", '  if(!LEAD.email){'],
    ["api('/guided-discovery?op=questions&assessment=self-guided')", "api('/guided-discovery?op=questions&assessment='+ASSESSMENT)"],
    ["{op:'create',consent:true,assessment:'self-guided',source:'aem-eds:/acs/cja-migration-assessment',",
      '{op:\'create\',consent:true,assessment:ASSESSMENT,source:SOURCE,'],
    ["{op:'start',assessment:'self-guided',leadRef:state.submissionId,source:'aem-eds:/acs/cja-migration-assessment',",
      '{op:\'start\',assessment:ASSESSMENT,view:VIEW_PROFILE,leadRef:state.submissionId,source:SOURCE,'],
    [baseAnchor(master),
      `${BASE_LINE}
// every profile, response and answer from this page is stored as the facilitator-led assessment,
// with this page's view (executive or practitioner, from the link) on the response
const ASSESSMENT='facilitator-led';
const SOURCE='app-builder:/${file}';`],
    [' * Flow: profile form -> POST /assessments {op:create} -> POST /guided-discovery {op:start, leadRef}',
      " * Flow: profile form -> POST /assessments {op:create, assessment:'facilitator-led'}\n * -> POST /guided-discovery {op:start, assessment:'facilitator-led', view, leadRef}"]
  ]
  let html = master
  for (const [from, to] of edits) {
    if (from instanceof RegExp) {
      if (!from.test(html)) throw new Error(`no match: ${from}`)
      html = html.replace(from, to)
    } else {
      html = replaceOnce(html, from, to)
    }
  }
  if (/assessment:'self-guided'|assessment=self-guided/.test(html)) throw new Error('a self-guided API call is left')
  html = applyWrapUp(html, snippet)
  return { file, html }
}

function build (master, snippet) {
  return [selfGuided(master, snippet), facilitator(master, snippet)]
}

function main () {
  const masterPath = process.argv[2] || MASTER
  const master = fs.readFileSync(masterPath, 'utf8')
  const snippet = fs.readFileSync(SNIPPET, 'utf8')
  for (const { file, html } of build(master, snippet)) {
    fs.writeFileSync(path.join(ROOT, 'web-src', file), html)
    console.log(`wrote web-src/${file}`)
  }
}

if (require.main === module) main()
module.exports = { build, selfGuided, facilitator, MASTER, SNIPPET, BASE_LINE, SYNC_END, WRAP_START, WRAP_END }
