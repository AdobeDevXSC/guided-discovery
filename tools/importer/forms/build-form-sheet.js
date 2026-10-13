/* eslint-disable no-console */
/**
 * Builds an EDS form definition sheet (:type "sheet") from a captured field spec.
 *
 * Usage: node tools/importer/forms/build-form-sheet.js <source.json> <output.json>
 *
 * Every cell is written as a string so the result can be authored as a spreadsheet.
 * The form block splits Options on commas, so commas inside an option label are
 * replaced with " /" (the original label is kept in the source capture).
 */
const fs = require('fs');
const path = require('path');

const COLUMNS = [
  'Name', 'Type', 'Description', 'Placeholder', 'Label', 'Read Only', 'Mandatory',
  'Pattern', 'Step', 'Min', 'Max', 'Value', 'Options', 'OptionNames', 'Fieldset',
  'Repeatable', 'Visible', 'Visible Expression', 'Required Error Message',
  'Autocomplete', 'richText',
];

const row = (cells) => Object.fromEntries(COLUMNS.map((c) => [c, cells[c] ?? '']));
const optionLabel = (text) => text.replace(/\s*,\s*/g, ' / ');

function buildRows(spec) {
  const rows = [];
  if (spec.intro) {
    rows.push(row({ Name: 'intro', Type: 'plain-text', Value: spec.intro }));
  }
  spec.fields.forEach((f) => {
    const cells = {
      Name: f.name,
      Type: f.type,
      Label: f.label,
      Placeholder: f.placeholder || '',
      Mandatory: f.required ? 'true' : '',
      Autocomplete: f.autocomplete || '',
      'Required Error Message': f.required ? 'Required' : '',
    };
    if (f.options) cells.Options = f.options.map(optionLabel).join(', ');
    if (f.visibleWhen) {
      cells.Visible = 'false';
      cells['Visible Expression'] = `${f.visibleWhen.field} == "${f.visibleWhen.equals}"`;
    }
    rows.push(row(cells));
  });
  if (spec.consentHtml) {
    rows.push(row({
      Name: 'consent', Type: 'plain-text', Value: spec.consentHtml, richText: 'true',
    }));
  }
  rows.push(row({ Name: 'submit', Type: 'submit', Label: spec.submitLabel || 'Submit' }));
  return rows;
}

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('Usage: node build-form-sheet.js <source.json> <output.json>');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(src, 'utf8'));
const data = buildRows(spec);
const sheet = {
  total: data.length,
  offset: 0,
  limit: data.length,
  data,
  ':type': 'sheet',
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(sheet, null, 2)}\n`);
console.log(`Wrote ${data.length} rows to ${out}`);
