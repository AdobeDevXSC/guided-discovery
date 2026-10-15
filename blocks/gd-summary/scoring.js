/*
 * Recommendation scoring for the structured-content Guided Discovery. Pure functions over the
 * authored documents and the stored answers, so the gd-summary block (live preview) and the App
 * Builder action (authoritative result at complete) compute the same thing.
 *
 *   summary  - the "guided-discovery-summary" document (thresholds, sizes, capabilities)
 *   docs     - { sectionId: "guided-discovery-section" document } for summary.sections
 *   sections - the session's sections: { "sc-<sectionId>": { answers: { questionId: [...] } } }
 *
 * Capabilities come from the content: an answered option or choice unlocks its `capabilities`,
 * and a question with `upgradeFrom` unlocks `upgradeCapabilities` when its pick sits further along
 * than the referenced question's pick. Reasons are returned as IDs so the copy stays authored.
 */

const list = (v) => (Array.isArray(v) ? v : []);
const optionsOf = (q) => list(q && q.options);

/** The stored answer list for "sectionId.questionId". */
export function answersFor(sections, ref) {
  const [sectionId, questionId] = String(ref || '').split('.');
  return list((((sections || {})[`sc-${sectionId}`] || {}).answers || {})[questionId]);
}

const questionFor = (docs, ref) => {
  const [sectionId, questionId] = String(ref || '').split('.');
  return list((docs[sectionId] || {}).questions).find((q) => q.id === questionId) || null;
};

/** Share of the readinessFrom question's options that were picked (0..1). */
export function readiness(summary, docs, sections) {
  const q = questionFor(docs, summary.readinessFrom);
  const ids = optionsOf(q).map((o) => o.id);
  if (!ids.length) return 0;
  const picked = new Set(answersFor(sections, summary.readinessFrom));
  return ids.filter((id) => picked.has(id)).length / ids.length;
}

/** Capabilities unlocked by the answers, in the summary's authored order. */
export function matchCapabilities(summary, docs, sections) {
  const matches = new Map();
  const add = (capId, reason) => {
    if (!matches.has(capId)) matches.set(capId, []);
    matches.get(capId).push(reason);
  };

  list(summary.sections).forEach((sectionId) => {
    const questions = list((docs[sectionId] || {}).questions);
    questions.forEach((q) => {
      const ref = `${sectionId}.${q.id}`;
      const answers = answersFor(sections, ref);
      const options = optionsOf(q);
      answers.forEach((answer) => {
        // "item:choice" (per-item, sort) unlocks the choice's capabilities; a plain id the option's
        const [optId, choiceId] = answer.split(':');
        if (answer.includes('=')) return; // owner names
        if (choiceId !== undefined) {
          const choice = list(q.choices).find((c) => c.id === choiceId);
          list(choice && choice.capabilities).forEach((cap) => add(cap, {
            section: sectionId, question: q.id, option: optId, choice: choiceId,
          }));
          return;
        }
        const option = options.find((o) => o.id === optId);
        list(option && option.capabilities).forEach((cap) => add(cap, {
          section: sectionId, question: q.id, option: optId,
        }));
      });
      if (q.upgradeFrom && list(q.upgradeCapabilities).length) {
        const fromQ = questions.find((x) => x.id === q.upgradeFrom);
        const at = (qq, a) => optionsOf(qq).findIndex((o) => o.id === a[0]);
        const to = at(q, answers);
        const from = at(fromQ, answersFor(sections, `${sectionId}.${q.upgradeFrom}`));
        if (from >= 0 && to > from) {
          q.upgradeCapabilities.forEach((cap) => add(cap, {
            section: sectionId, question: q.id, option: answers[0], upgrade: true,
          }));
        }
      }
    });
  });

  const known = list(summary.capabilities).map((c) => c.id);
  return known.filter((id) => matches.has(id)).map((id) => ({ id, reasons: matches.get(id) }));
}

/** The highest headline whose minReadiness the score reaches (or the lowest one). */
export function headline(summary, pct) {
  const sorted = [...list(summary.headlines)].sort((a, b) => b.minReadiness - a.minReadiness);
  const hit = sorted.find((hl) => pct >= hl.minReadiness) || sorted[sorted.length - 1];
  return hit ? hit.id : null;
}

/** The first size whose rules hold; a size without rules always matches. */
export function engagementSize(summary, matchedCount, pct) {
  const sizes = list(summary.sizes);
  const hit = sizes.find((s) => {
    const rules = [];
    if (typeof s.maxCapabilities === 'number') rules.push(matchedCount <= s.maxCapabilities);
    if (typeof s.maxReadiness === 'number') rules.push(pct < s.maxReadiness);
    if (!rules.length) return true;
    return s.match === 'any' ? rules.some(Boolean) : rules.every(Boolean);
  }) || sizes[sizes.length - 1];
  return hit ? hit.id : null;
}

export function computeSummary(summary, docs, sections) {
  if (!summary) return null;
  const pct = readiness(summary, docs || {}, sections || {});
  const matchedCapabilities = matchCapabilities(summary, docs || {}, sections || {});
  return {
    readinessPct: Math.round(pct * 1000) / 1000,
    headline: headline(summary, pct),
    matchedCapabilities,
    engagement: engagementSize(summary, matchedCapabilities.length, pct),
  };
}
