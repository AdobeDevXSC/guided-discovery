// The two hosted pages are built from the master: self-guided.html and facilitator.html (scripts/build-pages.js).
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { build, MASTER, SNIPPET, BASE_LINE, SYNC_END, WRAP_START, WRAP_END } = require('../scripts/build-pages')

const master = fs.readFileSync(MASTER, 'utf8')
const snippet = fs.readFileSync(SNIPPET, 'utf8')
const built = Object.fromEntries(build(master, snippet).map((p) => [p.file, p.html]))
const SELF = built['self-guided.html']
const FAC = built['facilitator.html']

test('web-src has exactly the pages the master builds, and they are up to date', () => {
  assert.deepStrictEqual(Object.keys(built).sort(), ['facilitator.html', 'self-guided.html'])
  for (const [file, html] of Object.entries(built)) {
    const onDisk = fs.readFileSync(path.join(__dirname, '..', 'web-src', file), 'utf8')
    assert.ok(onDisk === html, `web-src/${file} is out of date: run node scripts/build-pages.js`)
  }
  const pages = fs.readdirSync(path.join(__dirname, '..', 'web-src')).filter((f) => /\.html$/.test(f))
  assert.ok(!pages.some((f) => /^facilitator-/.test(f)), 'only self-guided.html and facilitator.html are assessment pages')
})

test('both pages follow the environment serving them and carry the wrap-up code once', () => {
  for (const html of [SELF, FAC]) {
    assert.strictEqual(html.split(BASE_LINE).length - 1, 1)
    assert.ok(!html.includes("const BASE='https://"))
    assert.strictEqual(html.split('window.WRAPUP_GUIDE = ').length - 1, 2) // initial value + the finished guide
    assert.ok(html.indexOf('window.generateModernizationGuide = ') < html.lastIndexOf(SYNC_END.trim().split('\n')[0]))
  }
})

test('self-guided saves as self-guided', () => {
  assert.ok(SELF.includes('const VIEW_PROFILE = "selfguided";'))
  assert.ok(SELF.includes("assessment:'self-guided'"))
})

test('the facilitator page takes its view from the link and saves as facilitator-led', () => {
  assert.ok(FAC.includes("const VIEW_PROFILE = new URLSearchParams(location.search).get('view') === 'executive' ? 'executive' : 'practitioner';"))
  assert.ok(FAC.includes('let GATE_PASSED = false;'))
  assert.ok(FAC.includes("const ASSESSMENT='facilitator-led';"))
  assert.ok(FAC.includes('view:VIEW_PROFILE'))
  assert.ok(!/assessment:'self-guided'|assessment=self-guided/.test(FAC))
})

test('every inline script parses', () => {
  for (const html of [SELF, FAC]) {
    for (const m of html.matchAll(/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(m[1])
  }
})

// the master as it was handed over originally: no wrap-up block and the Stage-only API base
const ORIGINAL_BASE = "const BASE='https://20409-157ochretakin-stage.adobeio-static.net/api/v1/web/marketingprototype';"
const original = (() => {
  const a = master.indexOf(WRAP_START)
  const stripped = master.slice(0, a).replace(/\n$/, '') + master.slice(master.indexOf(WRAP_END) + WRAP_END.length)
  return stripped.replace(BASE_LINE, ORIGINAL_BASE)
})()

test('the updated master (wrap-up and API base built in) is its own self-guided page', () => {
  assert.ok(master.includes(WRAP_START) && master.includes(BASE_LINE))
  assert.ok(master.includes('const VIEW_PROFILE = "selfguided";'))
  assert.ok(SELF === master)
})

test('the original master and the updated master build the same pages', () => {
  assert.ok(!original.includes(WRAP_START) && original.includes(ORIGINAL_BASE))
  const fromOriginal = Object.fromEntries(build(original, snippet).map((p) => [p.file, p.html]))
  assert.ok(fromOriginal['self-guided.html'] === SELF)
  assert.ok(fromOriginal['facilitator.html'] === FAC)
})

test('a master that changed shape fails instead of building a wrong page', () => {
  assert.throws(() => build(original.replace('const VIEW_PROFILE = "selfguided";', ''), snippet), /expected exactly one match/)
  assert.throws(() => build(original.replace(SYNC_END, '\n</script>\n</body>'), snippet), /expected exactly one match/)
  assert.throws(() => build(master + `\n${WRAP_START}`, snippet), /single pair/)
})
