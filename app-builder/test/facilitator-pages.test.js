// The facilitator page builder: each page is fixed to its view and saves as facilitator-led.
const assert = require('assert')
const { pageFor } = require('../scripts/make-facilitator-pages')

// The parts of the master file the builder edits, as they appear there.
const MASTER = [
  '<title>Guided Discovery</title>',
  'const VIEW_PROFILE = "selfguided";',
  'let GATE_PASSED = (VIEW_PROFILE !== "selfguided"); // facilitator-led profiles skip the gate entirely',
  "  if(VIEW_PROFILE==='selfguided'){\n    payload.lead = {};",
  "  if(VIEW_PROFILE==='selfguided'){\n    const fullName = '';",
  "  if(VIEW_PROFILE==='selfguided' && !LEAD.email){",
  "api('/guided-discovery?op=questions&assessment=self-guided')",
  "{op:'create',consent:true,assessment:'self-guided',source:'aem-eds:/acs/cja-migration-assessment',profile:{}}",
  "{op:'start',assessment:'self-guided',leadRef:state.submissionId,source:'aem-eds:/acs/cja-migration-assessment',contentVersion:''}",
  "const BASE='https://20409-157ochretakin-stage.adobeio-static.net/api/v1/web/marketingprototype';",
  ' * Flow: profile form -> POST /assessments {op:create} -> POST /guided-discovery {op:start, leadRef}'
].join('\n')

test('each page is fixed to its view and saves as facilitator-led', () => {
  for (const view of ['executive', 'practitioner']) {
    const { file, html } = pageFor(MASTER, view)
    assert.strictEqual(file, `facilitator-${view}.html`)
    assert.ok(html.includes(`const VIEW_PROFILE = "${view}";`))
    assert.ok(html.includes('let GATE_PASSED = false;'))
    assert.ok(html.includes("const ASSESSMENT='facilitator-led';"))
    assert.ok(html.includes('view:VIEW_PROFILE'))
    assert.ok(!/assessment:'self-guided'|assessment=self-guided/.test(html))
  }
})

test('a master that changed shape fails instead of building a wrong page', () => {
  assert.throws(() => pageFor(MASTER.replace('const VIEW_PROFILE = "selfguided";', ''), 'executive'), /expected exactly one match/)
})
