// The wrap-up document template. Claude writes only the personalized content as JSON; this fills it into
// a fixed HTML template (Handlebars syntax), so a run produces a few thousand tokens instead of a whole
// document. Text from Claude is always HTML-escaped; raw ({{{ }}} / {{& }}) output is not allowed.
//
//   {{headline}}                       a field Claude fills in
//   {{#each priorities}}{{title}}{{/each}}   a list of objects (inside the block, fields are the item's)
//   {{#each steps}}{{this}}{{/each}}   a list of plain strings
//   {{computed.readinessPct}}          computed from the scoring rules; Claude is not asked for these
//   {{add @index 1}}                   helper: numbers from 1
//   {{#if (eq status "proposed")}}    helper: compare a field with a word (case-insensitive)
//   {{!-- field status: "existing" or "proposed" --}}   a hint shown to Claude for that field (not in the output)
const Handlebars = require('handlebars/dist/cjs/handlebars').create()

Handlebars.registerHelper('add', (a, b) => Number(a) + Number(b))
// {{#if (eq status "proposed")}}: case-insensitive comparison of a field with a word
Handlebars.registerHelper('eq', (a, b) => typeof b === 'string' && String(a == null ? '' : a).trim().toLowerCase() === b.toLowerCase())

const MAX_TEMPLATE = 400000

/** Throws an Error with a short message when the template cannot be used. */
function check (text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('required')
  if (text.length > MAX_TEMPLATE) throw new Error(`at most ${MAX_TEMPLATE.toLocaleString('en-US')} characters`)
  if (/\{\{\{|\{\{&/.test(text)) throw new Error('raw output ({{{ }} or {{& }}) is not allowed; use {{field}}')
  if (/\{\{>|\{\{#\*|\{\{\s*lookup|\{\{\s*log/.test(text)) throw new Error('partials, lookup and log are not supported')
  let ast
  try {
    ast = Handlebars.parse(text)
    Handlebars.precompile(text)
  } catch (e) {
    throw new Error(`template error: ${String(e.message).split('\n')[0].slice(0, 200)}`)
  }
  return ast
}

const HINT = (path) => `<${path[path.length - 1]}>`

function setPath (obj, parts) {
  let cur = obj
  parts.forEach((p, i) => {
    if (i === parts.length - 1) { if (!(p in cur)) cur[p] = HINT(parts); return }
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {}
    cur = cur[p]
  })
}

/** The JSON shape Claude is asked for: the fields the template uses, minus computed.* */
function skeleton (text, notes = []) {
  const ast = check(text)
  const root = {}
  const hints = []
  const addPath = (obj, p) => {
    if (p && p.type === 'SubExpression') { (p.params || []).forEach((q) => addPath(obj, q)); return }
    if (!p || p.type !== 'PathExpression' || p.data || p.depth > 0 || p.original === 'this') return
    if (p.parts[0] === 'computed') return
    setPath(obj, p.parts)
  }
  const walk = (program, obj) => {
    if (!program) return
    for (const st of program.body) {
      if (st.type === 'CommentStatement') {
        const m = String(st.value).match(/^\s*field\s+([\w.]+)\s*:\s*([\s\S]+?)\s*$/)
        if (m) hints.push({ obj, parts: m[1].split('.'), text: m[2].replace(/\s+/g, ' ') })
      } else if (st.type === 'MustacheStatement') {
        if (!st.params.length && !(st.hash && st.hash.pairs && st.hash.pairs.length)) addPath(obj, st.path) // with params, the path is a helper name
        st.params.forEach((p) => addPath(obj, p))
      } else if (st.type === 'BlockStatement') {
        const name = st.path.original
        const param = st.params[0]
        if (name === 'each' && param && param.type === 'PathExpression' && !param.data && param.depth === 0 && param.parts[0] !== 'computed') {
          let owner = obj
          param.parts.slice(0, -1).forEach((p) => { if (typeof owner[p] !== 'object' || owner[p] === null) owner[p] = {}; owner = owner[p] })
          const last = param.parts[param.parts.length - 1]
          const item = {}
          walk(st.program, item)
          // an item with no fields of its own ({{this}}) is a plain string
          owner[last] = [Object.keys(item).length ? item : HINT(param.parts)]
        } else if (name === 'with' && param && param.type === 'PathExpression' && param.parts[0] !== 'computed') {
          setPath(obj, param.parts)
          let inner = obj
          param.parts.forEach((p) => { if (typeof inner[p] !== 'object' || inner[p] === null) inner[p] = {}; inner = inner[p] })
          walk(st.program, inner)
        } else {
          addPath(obj, param)
          walk(st.program, obj)
          walk(st.inverse, obj)
        }
      }
    }
  }
  walk(ast, root)
  // hints replace the generic <name> placeholder of a plain field
  for (const h of hints) {
    let cur = h.obj
    let applied = false
    h.parts.forEach((p, i) => {
      if (Array.isArray(cur)) cur = cur[0] // inside a list: the hint is for its items
      if (!cur || typeof cur !== 'object') return
      if (i === h.parts.length - 1) {
        if (typeof cur[p] === 'string') { cur[p] = h.text; applied = true } else if (Array.isArray(cur[p]) && typeof cur[p][0] === 'string') { cur[p] = [h.text]; applied = true }
      } else cur = cur[p]
    })
    // a hint for a list or an object (how many items, what they are) goes into the notes
    if (!applied) notes.push(`${h.parts.join('.')}: ${h.text}`)
  }
  return root
}

/** Fills the template: Claude's fields plus the computed facts (which cannot be overridden). */
function render (text, data, computed) {
  check(text)
  const context = Object.assign({}, data && typeof data === 'object' ? data : {}, { computed: computed || {} })
  return Handlebars.compile(text, { strict: false })(context)
}

/** Claude's reply as an object: plain JSON, or JSON inside a code fence or after a sentence. */
function extractJson (reply) {
  let t = String(reply || '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const a = t.indexOf('{')
  const b = t.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('the reply is not a JSON object')
  let obj
  try { obj = JSON.parse(t.slice(a, b + 1)) } catch (e) { throw new Error('the reply is not valid JSON') }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('the reply is not a JSON object')
  return obj
}

/** What to add to the skill's system prompt so Claude answers with the JSON the template needs. */
function outputInstructions (text) {
  const notes = []
  const shape = skeleton(text, notes)
  return '\n\n## Output format\n' +
    'These rules replace any earlier instruction about the output format or the document structure.\n' +
    'Do not write the finished document. Reply with ONE JSON object and nothing else: no code fences, no commentary. ' +
    'A template places your text into the finished document, so every value is plain text (no HTML or Markdown), ' +
    'and a list holds as many items as the content needs. Use exactly these fields:\n\n' +
    JSON.stringify(shape, null, 2) +
    (notes.length ? '\n\nNotes on the fields:\n' + notes.map((n) => `- ${n}`).join('\n') : '') +
    '\n\nFacts such as the company name, readiness score, matched capabilities and recommended engagement are filled in for you; do not include them.'
}

module.exports = { check, skeleton, render, extractJson, outputInstructions, MAX_TEMPLATE }
