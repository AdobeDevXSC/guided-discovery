/* Run with: node --test test/guided-discovery/*.test.js */
/*
 * The structured-content scoring (blocks/gd-summary/scoring.js) driven by the seeded documents
 * must agree with the catalog scoring the live app was ported to.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeSummary } from '../../blocks/gd-summary/scoring.js';
import { computeResult } from './fixtures/legacy-scoring.js';
import { DF_ITEMS } from '../../tools/importer/guided-discovery/catalog.js';

const tools = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../tools/importer/guided-discovery');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-docs-'));
const run = (script, arg) => execFileSync(process.execPath, [path.join(tools, script), arg], { stdio: 'ignore' });
run('build-discovery-content.js', path.join(dir, 'discovery.json'));
run('build-data-foundations-content.js', path.join(dir, 'data-foundations.json'));
run('build-sections-content.js', dir);
run('build-summary-content.js', path.join(dir, 'summary.json'));
const read = (id) => JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')).data;
const summary = read('summary');
const docs = Object.fromEntries(summary.sections.map((id) => [id, read(id)]));

/** The same respondent in both storage shapes. */
function respondent({
  needs = [], tracked = [], current, target, gov = {}, ai, picks = [],
}) {
  const sc = {
    discovery: { answers: { needs } },
    'data-foundations': { answers: { tracked } },
    identity: { answers: { ...(current ? { 'identity-current': [current] } : {}), ...(target ? { 'identity-target': [target] } : {}) } },
    governance: { answers: { status: Object.entries(gov).map(([k, v]) => `${k}:${v}`) } },
    'strategy-adoption': { answers: { ...(ai ? { 'strategy-ai': [ai] } : {}), 'ai-picks': picks } },
  };
  const legacy = {
    discovery: { needs },
    dataFoundations: { selected: tracked },
    identity: { current, target },
    governance: { status: gov },
    strategyAdoption: { answers: ai ? { 'strategy-ai': [ai] } : {}, aiCapabilityPicks: picks },
  };
  return { sc, legacy };
}

const ids = (result) => result.matchedCapabilities.map((c) => c.id).sort();
const same = (input) => {
  const { sc, legacy } = respondent(input);
  const next = computeSummary(summary, docs, sc);
  const old = computeResult(legacy);
  assert.deepEqual(ids(next), ids(old));
  assert.equal(next.readinessPct, old.readinessPct);
  assert.equal(next.headline, old.headline);
  assert.equal(next.engagement, old.engagement);
  return next;
};

test('an empty session scores early discovery, small, nothing matched', () => {
  const r = same({});
  assert.equal(r.headline, 'early-discovery');
  assert.equal(r.engagement, 'small');
  assert.equal(r.matchedCapabilities.length, 0);
});

test('needs, data foundations, identity, governance and AI all unlock as before', () => {
  const r = same({
    needs: ['personalization', 'messaging', 'real-time-activation'],
    tracked: ['cross-device', 'attribution', 'anomaly'],
    current: 'none',
    target: 'unified-graph',
    gov: { consent: 'gap', 'data-labels': 'in-place' },
    ai: 'actively-exploring',
    picks: ['content-analytics'],
  });
  assert.equal(r.matchedCapabilities.length, 8);
  assert.equal(r.engagement, 'medium'); // 3 of 24 tracked keeps readiness under 67%
});

test('a lower identity target does not unlock graph stitching', () => {
  const r = same({ current: 'unified-graph', target: 'none' });
  assert.equal(r.matchedCapabilities.length, 0);
});

test('readiness bands and sizing edges follow the inventory share', () => {
  const all = DF_ITEMS.map((i) => i.id);
  [0, 5, 6, 8, 9, 14, 15, 16, 17, 24].forEach((n) => same({ tracked: all.slice(0, n) }));
  same({ tracked: all.slice(0, 15), needs: ['personalization', 'messaging', 'content-supply-chain'] });
  same({ tracked: all.slice(0, 17), needs: ['personalization', 'messaging', 'content-supply-chain', 'segmentation', 'brand-visibility', 'customer-experience'] });
});

test('reasons point at the answer that unlocked each capability', () => {
  const { sc } = respondent({ gov: { consent: 'gap' }, current: 'none', target: 'cross-channel' });
  const r = computeSummary(summary, docs, sc);
  const byId = Object.fromEntries(r.matchedCapabilities.map((c) => [c.id, c.reasons]));
  assert.deepEqual(byId['data-transformations'], [{
    section: 'governance', question: 'status', option: 'consent', choice: 'gap',
  }]);
  assert.deepEqual(byId['graph-stitching'], [{
    section: 'identity', question: 'identity-target', option: 'cross-channel', upgrade: true,
  }]);
});
