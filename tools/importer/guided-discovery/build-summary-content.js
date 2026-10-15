/* eslint-disable no-console */
/**
 * Seeds the Summary structured content document (schema: guided-discovery-summary) from the copy
 * source: headline bands with their next steps, engagement sizes with the live app's thresholds,
 * capability copy, snapshot rows and the Adobe team.
 *
 * Usage: node tools/importer/guided-discovery/build-summary-content.js <output.json>
 *
 * Output is { metadata, data }; convert with @adobe/da-sc-sdk convertJsonToHtml and upload to
 * /forms/guided-discovery/summary.
 */
const fs = require('fs');
const path = require('path');

const out = process.argv[2];
if (!out) {
  console.error('Usage: node build-summary-content.js <output.json>');
  process.exit(1);
}

const copy = JSON.parse(fs.readFileSync(path.join(__dirname, 'copy.source.json'), 'utf8'));
const ui = Object.fromEntries(copy.ui.map((u) => [u.key, u.text]));
const steps = (id) => [1, 2, 3].map((n) => ({
  title: ui[`step.${id}.${n}.title`], text: ui[`step.${id}.${n}.text`],
}));
const size = (id, rules) => ({
  id,
  label: ui[`size.${id}.label`],
  duration: ui[`size.${id}.duration`],
  model: ui[`size.${id}.model`],
  title: ui[`size.${id}.title`],
  text: ui[`size.${id}.text`],
  ...rules,
});
// the live page's links are placeholders (#); authors add the URLs in DA
const link = (n) => ({ label: ui[`summary.link${n}`] });

const data = {
  heading: ui['summary.heading'],
  intro: 'Everything you checked above adds up to a recommendation. It updates as you go - submit when it looks right and your Adobe team will follow up.',
  sections: ['discovery', 'data-foundations', 'segmentation', 'identity', 'governance', 'roles', 'strategy-adoption'],
  readinessFrom: 'data-foundations.tracked',
  labels: {
    submit: ui['summary.finish'],
    submitting: ui['summary.submitting'],
    download: ui['summary.downloadPdf'],
    snapshotHeading: ui['summary.snapshot'],
    unlocksHeading: ui['summary.unlocks'],
    engagementHeading: ui['summary.engagement'],
    nextStepsHeading: ui['summary.nextSteps'],
    teamHeading: ui['summary.team'],
    reason: 'You picked "{option}" in {section}.',
    reasonChoice: '"{option}" is marked "{choice}" in {section}.',
    reasonUpgrade: 'Your {section} target ("{option}") is further along than where you are today.',
    readiness: '{pct}% of the Data Foundations inventory reviewed',
    thanksHeading: ui['summary.thanksHeading'],
    thanksText: ui['summary.thanksText'],
    empty: 'Nothing captured yet - work through the sections above, and they will show up here.',
    notSet: ui['summary.notSet'],
    error: 'That did not go through. Please try again in a moment.',
  },
  snapshot: [
    { label: ui['summary.snap.focus'], source: 'discovery.focus', show: 'answer' },
    {
      label: ui['summary.snap.df'], source: 'data-foundations.tracked', show: 'count', template: ui['summary.snap.dfValue'],
    },
    {
      label: 'Identity target', source: 'identity.identity-target', show: 'answer',
    },
    {
      label: ui['summary.snap.gov'], source: 'governance.status', show: 'choice-count', choice: 'gap', template: ui['summary.snap.govValue'],
    },
    {
      label: ui['summary.snap.roles'], source: 'roles.owners', show: 'owner-count', template: ui['summary.snap.rolesValue'],
    },
    {
      label: ui['summary.snap.strategy'], source: 'strategy-adoption', show: 'answered-count', template: ui['summary.snap.strategyValue'],
    },
  ],
  // thresholds from the live app: >= 60% migration-ready, >= 25% building your case
  headlines: [
    {
      id: 'migration-ready', label: ui['headline.migration-ready'], minReadiness: 0.6, steps: steps('migration-ready'),
    },
    {
      id: 'building-your-case', label: ui['headline.building-your-case'], minReadiness: 0.25, steps: steps('building-your-case'),
    },
    {
      id: 'early-discovery', label: ui['headline.early-discovery'], minReadiness: 0, steps: steps('early-discovery'),
    },
  ],
  // small if <= 2 capabilities and readiness < 34%; medium if <= 5 or readiness < 67%; else large
  sizes: [
    size('small', { maxCapabilities: 2, maxReadiness: 0.34, match: 'all' }),
    size('medium', { maxCapabilities: 5, maxReadiness: 0.67, match: 'any' }),
    size('large', {}),
  ],
  sizeNote: ui['size.note'],
  capabilities: copy.capabilities.map((c) => ({
    id: c.id, label: c.name, description: c.description,
  })),
  contacts: copy.contacts.map((c) => ({ name: c.name, role: c.role })),
  links: [link(1), link(2), link(3)],
  disclaimer: ui['summary.disclaimer'],
};

const doc = { metadata: { schemaName: 'guided-discovery-summary', title: 'Summary' }, data };
fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote summary (${data.capabilities.length} capabilities) to ${out}`);
