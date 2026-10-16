/*
 * Reference only: the original catalog scoring, ported from the live app's computeRecommendation /
 * getMatchedCapabilities / getEngagementSize. summary-scoring.test.js checks the structured-content
 * scoring (blocks/gd-summary/scoring.js) and the seeded documents against it.
 */
import {
  CAPABILITIES, DF_ITEMS, GOVERNANCE, IDENTITY_STAGES, NEED_TO_CAPABILITY, NEEDS,
} from '../../../tools/importer/guided-discovery/catalog.js';

const AI_INTEREST = ['actively-exploring', 'not-yet-but-interested'];

const list = (v) => (Array.isArray(v) ? v : []);

/**
 * Capabilities matched from the answers, in the order the live app adds them.
 * @returns {{id: string, reasons: {code: string, ref?: string, count?: number}[]}[]}
 */
export function matchCapabilities(sections = {}) {
  const matches = new Map();
  const add = (capId, reason) => {
    if (!matches.has(capId)) matches.set(capId, []);
    const reasons = matches.get(capId);
    if (!reasons.some((r) => r.code === reason.code && r.ref === reason.ref)) reasons.push(reason);
  };

  const discovery = sections.discovery || {};
  const needs = list(discovery.needs);
  NEEDS.forEach(({ id }) => {
    if (needs.includes(id)) (NEED_TO_CAPABILITY[id] || []).forEach((cap) => add(cap, { code: 'need', ref: id }));
  });

  const selected = list((sections.dataFoundations || {}).selected);
  if (selected.includes('cross-device')) add('graph-stitching', { code: 'df-cross-device' });
  if (selected.includes('attribution')) add('attribution', { code: 'df-attribution' });
  if (selected.includes('anomaly')) add('experimentation', { code: 'df-anomaly' });

  const { current, target } = sections.identity || {};
  if (current && target && IDENTITY_STAGES.indexOf(target) > IDENTITY_STAGES.indexOf(current)) {
    add('graph-stitching', { code: 'identity-target' });
  }

  const status = (sections.governance || {}).status || {};
  const gaps = GOVERNANCE.filter((g) => status[g] === 'gap').length;
  if (gaps > 0) add('data-transformations', { code: 'governance-gaps', count: gaps });

  const strategy = sections.strategyAdoption || {};
  const aiAnswer = list((strategy.answers || {})['strategy-ai'])[0];
  if (AI_INTEREST.includes(aiAnswer)) add('ai-capabilities', { code: 'ai-interest' });
  list(strategy.aiCapabilityPicks).forEach((cap) => add(cap, { code: 'ai-pick' }));

  return [...matches.entries()]
    .filter(([id]) => CAPABILITIES.includes(id))
    .map(([id, reasons]) => ({ id, reasons }));
}

/** Self-guided readiness: share of the Data Foundations inventory marked as tracked (0..1). */
export function readiness(sections = {}) {
  const selected = list((sections.dataFoundations || {}).selected);
  const known = selected.filter((id) => DF_ITEMS.some((item) => item.id === id)).length;
  return DF_ITEMS.length ? known / DF_ITEMS.length : 0;
}

export function headline(readinessPct) {
  if (readinessPct >= 0.6) return 'migration-ready';
  if (readinessPct >= 0.25) return 'building-your-case';
  return 'early-discovery';
}

/** Rough, non-binding engagement size; thresholds from the live app. */
export function engagementSize(matchedCount, readinessPct) {
  if (matchedCount <= 2 && readinessPct < 0.34) return 'small';
  if (matchedCount <= 5 || readinessPct < 0.67) return 'medium';
  return 'large';
}

export function computeResult(sections = {}) {
  const pct = readiness(sections);
  const matchedCapabilities = matchCapabilities(sections);
  return {
    readinessPct: Math.round(pct * 1000) / 1000,
    headline: headline(pct),
    matchedCapabilities,
    engagement: engagementSize(matchedCapabilities.length, pct),
  };
}
