/*
 * Loads the authored copy (a DA multi-sheet, see tools/importer/guided-discovery) and exposes
 * t(key, vars) for UI strings and item lookups keyed by catalog IDs. Missing copy falls back to
 * the key so a gap is visible instead of silently blank.
 */
import { fmt } from './dom.js';

const SHEETS = [
  'meta', 'ui', 'needs', 'buckets', 'prompts', 'prompt-options', 'routes', 'hub', 'tiers', 'df-categories',
  'df-items', 'segments', 'identity-stages', 'governance', 'roles', 'capabilities', 'crosswalk',
  'glossary', 'contacts', 'architecture',
];

export default async function loadCopy(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`copy sheet ${url} returned ${res.status}`);
  const json = await res.json();
  const rows = (name) => (json[name] && Array.isArray(json[name].data) ? json[name].data : []);
  const byId = (name) => new Map(rows(name).map((r) => [r.id, r]));

  const ui = new Map(rows('ui').map((r) => [r.key, r.text]));
  const items = Object.fromEntries(SHEETS.map((n) => [n, byId(n)]));
  const promptOptions = new Map();
  rows('prompt-options').forEach((r) => {
    if (!promptOptions.has(r.prompt)) promptOptions.set(r.prompt, new Map());
    promptOptions.get(r.prompt).set(r.id, r);
  });
  const meta = new Map(rows('meta').map((r) => [r.key, r.text]));

  return {
    contentVersion: meta.get('contentVersion') || '',
    t: (key, vars) => fmt(ui.has(key) ? ui.get(key) : key, vars),
    item: (sheet, id) => (items[sheet] && items[sheet].get(id)) || { id, name: id, label: id },
    list: (sheet) => rows(sheet),
    option: (promptId, optionId) => {
      const o = promptOptions.get(promptId);
      return (o && o.get(optionId)) || { id: optionId, label: optionId, caption: '' };
    },
  };
}
