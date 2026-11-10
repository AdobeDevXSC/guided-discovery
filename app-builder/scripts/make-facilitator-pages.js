#!/usr/bin/env node
// Builds the two hosted facilitator-led pages from the guided discovery master HTML file:
//   web-src/facilitator-executive.html     (VIEW_PROFILE "executive")
//   web-src/facilitator-practitioner.html  (VIEW_PROFILE "practitioner")
// Each page shows the contact form and saves its profile, response and answers as assessment
// "facilitator-led", with its view on the response.
//
//   node scripts/make-facilitator-pages.js <master.html>
//
// The master is the file whose VIEW_PROFILE line selects the version (it ships as "selfguided").
// Every edit below must match exactly once, so a master that changed shape fails loudly instead of
// producing a page that saves to the wrong place.
const fs = require('fs')
const path = require('path')

const VIEWS = {
  executive: { file: 'facilitator-executive.html', label: 'Executive session' },
  practitioner: { file: 'facilitator-practitioner.html', label: 'Practitioner session' }
}

function replaceOnce (html, from, to) {
  const count = html.split(from).length - 1
  if (count !== 1) throw new Error(`expected exactly one match, found ${count}: ${from.slice(0, 80)}`)
  return html.replace(from, () => to)
}

function pageFor (master, view) {
  const { file, label } = VIEWS[view]
  const edits = [
    [/<title>([^<]*)<\/title>/, (m, t) => `<title>${t} · ${label}</title>`],
    ['const VIEW_PROFILE = "selfguided";',
      `/* FACILITATOR-LED PAGE (web-src/${file}), built by scripts/make-facilitator-pages.js; edit the
   master file and rebuild instead of editing this one. Saves as assessment "facilitator-led" with
   view "${view}". The contact form is shown here too, so each session is linked to the client's profile. */
const VIEW_PROFILE = "${view}";`],
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
    ["const BASE='https://20409-157ochretakin-stage.adobeio-static.net/api/v1/web/marketingprototype';",
      `const BASE=(location.hostname.endsWith('.adobeio-static.net')?location.origin:'https://20409-157ochretakin-stage.adobeio-static.net')+'/api/v1/web/marketingprototype'; // the API of the environment serving this page (Stage when opened from anywhere else)
// every profile, response and answer from this page is stored as the facilitator-led assessment,
// with this page's view ("${view}") on the response
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
  return { file, html }
}

function main () {
  const masterPath = process.argv[2]
  if (!masterPath) {
    console.error('usage: node scripts/make-facilitator-pages.js <master.html>')
    process.exit(2)
  }
  const master = fs.readFileSync(masterPath, 'utf8')
  const outDir = path.join(__dirname, '..', 'web-src')
  for (const view of Object.keys(VIEWS)) {
    const { file, html } = pageFor(master, view)
    fs.writeFileSync(path.join(outDir, file), html)
    console.log(`wrote web-src/${file} (${view})`)
  }
}

if (require.main === module) main()
module.exports = { pageFor, VIEWS }
