/* Run with: node --test test/guided-discovery/*.test.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeResult, engagementSize, headline, matchCapabilities, readiness,
} from '../../blocks/guided-discovery/lib/scoring.js';
import { DF_ITEMS, NEED_TO_CAPABILITY, CAPABILITIES } from '../../blocks/guided-discovery/lib/catalog.js';

const dfIds = (n) => DF_ITEMS.slice(0, n).map((i) => i.id);

test('readiness is the share of Data Foundations items tracked, ignoring unknown ids', () => {
  assert.equal(readiness({}), 0);
  assert.equal(readiness({ dataFoundations: { selected: dfIds(12) } }), 12 / DF_ITEMS.length);
  assert.equal(readiness({ dataFoundations: { selected: ['not-an-item'] } }), 0);
});

test('headline bands: >=60% ready, >=25% building, else early', () => {
  assert.equal(headline(0.6), 'migration-ready');
  assert.equal(headline(0.59), 'building-your-case');
  assert.equal(headline(0.25), 'building-your-case');
  assert.equal(headline(0.249), 'early-discovery');
});

test('engagement sizing edges', () => {
  assert.equal(engagementSize(2, 0.33), 'small');
  assert.equal(engagementSize(2, 0.34), 'medium');
  assert.equal(engagementSize(3, 0), 'medium');
  assert.equal(engagementSize(5, 0.9), 'medium');
  assert.equal(engagementSize(6, 0.66), 'medium');
  assert.equal(engagementSize(6, 0.67), 'large');
});

test('capabilities: needs, DF, identity, governance and AI rules, in live-app order', () => {
  const caps = matchCapabilities({
    discovery: { needs: ['cross-channel-measurement'] },
    dataFoundations: { selected: ['anomaly'] },
    identity: { current: 'none', target: 'unified-graph' },
    governance: { status: { consent: 'gap', 'data-labels': 'gap', 'access-groups': 'in-place' } },
    strategyAdoption: { answers: { 'strategy-ai': ['actively-exploring'] }, aiCapabilityPicks: ['connected-data'] },
  });
  assert.deepEqual(caps.map((c) => c.id), [
    'attribution', 'graph-stitching', 'experimentation', 'data-transformations', 'ai-capabilities', 'connected-data',
  ]);
  const stitching = caps.find((c) => c.id === 'graph-stitching');
  assert.deepEqual(stitching.reasons.map((r) => r.code), ['need', 'identity-target']);
  assert.equal(caps.find((c) => c.id === 'data-transformations').reasons[0].count, 2);
});

test('no identity rule when the target is not more mature than today', () => {
  const caps = matchCapabilities({ identity: { current: 'unified-graph', target: 'none' } });
  assert.equal(caps.length, 0);
});

test('computeResult on an empty session', () => {
  assert.deepEqual(computeResult({}), {
    readinessPct: 0, headline: 'early-discovery', matchedCapabilities: [], engagement: 'small',
  });
});

test('catalog: every need maps only to known capabilities', () => {
  Object.values(NEED_TO_CAPABILITY).flat()
    .forEach((cap) => assert.ok(CAPABILITIES.includes(cap), cap));
});
