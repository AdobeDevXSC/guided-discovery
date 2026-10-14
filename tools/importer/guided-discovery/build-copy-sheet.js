/* eslint-disable no-console */
/**
 * Builds the Guided Discovery copy as a DA multi-sheet (:type "multi-sheet") from copy.source.json.
 *
 * Usage: node tools/importer/guided-discovery/build-copy-sheet.js <copy.source.json> <output.json>
 *
 * One sheet per copy group; rows are keyed by catalog IDs (blocks/guided-discovery/lib/catalog.js)
 * so authors edit wording without touching IDs. Nested lists become their own sheets
 * (prompt options, lead options). Every cell is a string. Inline links use [text](https://...).
 */
const fs = require('fs');
const path = require('path');

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('Usage: node build-copy-sheet.js <copy.source.json> <output.json>');
  process.exit(1);
}
const copy = JSON.parse(fs.readFileSync(src, 'utf8'));

const kebab = (s) => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
const stringify = (row) => Object.fromEntries(
  Object.entries(row).map(([k, v]) => [k, Array.isArray(v) ? v.join('; ') : String(v ?? '')]),
);

const sheets = {};
sheets.meta = [{ key: 'contentVersion', text: copy.contentVersion }];
Object.entries(copy).forEach(([name, rows]) => {
  if (!Array.isArray(rows)) return;
  if (name === 'prompts') {
    sheets.prompts = rows.map(({ id, question }) => stringify({ id, question }));
    sheets['prompt-options'] = rows.flatMap((p) => p.options.map((o, i) => stringify({
      prompt: p.id, id: o.id, label: o.label, caption: (p.captions || [])[i] || '',
    })));
    return;
  }
  sheets[kebab(name)] = rows.map(stringify);
});
if (copy.lead) {
  sheets['lead-options'] = Object.entries(copy.lead)
    .flatMap(([field, opts]) => opts.map((o) => stringify({ field, id: o.id, label: o.label })));
}

const sheet = (data) => {
  const cols = Object.keys(data[0] || {});
  return {
    total: data.length,
    limit: data.length,
    offset: 0,
    data,
    ':colWidths': cols.map((c) => Math.min(600, Math.max(80, ...data.map((r) => r[c].length * 7)))),
  };
};
const names = Object.keys(sheets);
const doc = {
  ...Object.fromEntries(names.map((n) => [n, sheet(sheets[n])])),
  ':names': names,
  ':version': 3,
  ':type': 'multi-sheet',
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote ${names.length} sheets to ${out}: ${names.join(', ')}`);
