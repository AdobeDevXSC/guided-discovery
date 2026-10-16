/* eslint-disable no-console */
/**
 * Seeds the Overview structured content document (schema: guided-discovery-overview) with the
 * live app's overview screen: eyebrow, headline, intro, the three "Benefits of CJA" cards, what
 * the answers turn into, and the progress card labels.
 *
 * Usage: node tools/importer/guided-discovery/build-overview-content.js <output.json>
 *
 * Output is { metadata, data }; convert with @adobe/da-sc-sdk convertJsonToHtml and upload to
 * /forms/guided-discovery/overview.
 */
const fs = require('fs');
const path = require('path');

const out = process.argv[2];
if (!out) {
  console.error('Usage: node build-overview-content.js <output.json>');
  process.exit(1);
}

const copy = JSON.parse(fs.readFileSync(path.join(__dirname, 'copy.source.json'), 'utf8'));
const ui = Object.fromEntries(copy.ui.map((u) => [u.key, u.text]));
const ACCENTS = ['analysis', 'activation', 'both'];

const data = {
  eyebrow: 'Guided Discovery · Your Client',
  heading: 'Evolve how you understand your customers, safely and in sequence, with your data.',
  intro: "This session walks through how Your Client's current Adobe Analytics implementation maps into Customer Journey Analytics: what moves directly, what needs to be rebuilt, and what becomes possible for the first time once your data lives in a person-centric, cross-channel data lake.",
  benefitsHeading: ui['overview.benefitsHeading'],
  benefits: [1, 2, 3].map((n, i) => ({
    title: ui[`overview.benefit${n}.title`],
    text: ui[`overview.benefit${n}.text`],
    accent: ACCENTS[i],
  })),
  turnsInto: ui['overview.turnsInto'],
  outputs: [1, 2, 3].map((n) => ui[`overview.output${n}`]),
  // labels as in the live app's progress pills
  sections: [
    ['discovery', 'Discovery'],
    ['data-foundations', 'Data Foundations'],
    ['segmentation', 'Segmentation Rebuild'],
    ['identity', 'Identity & Stitching'],
    ['governance', 'Governance & Access'],
    ['roles', 'Roles & Stakeholders'],
    ['strategy-adoption', 'Strategy & Adoption'],
  ].map(([id, label]) => ({ id, label })),
  labels: {
    progressZero: ui['overview.progressZero'],
    progressHeading: ui['overview.progressHeading'],
    progressCount: ui['overview.progressCount'],
    start: ui['overview.ctaStart'],
    resume: ui['overview.ctaContinue'],
    done: ui['overview.ctaDone'],
  },
};

const doc = { metadata: { schemaName: 'guided-discovery-overview', title: 'Overview' }, data };
fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote overview (${data.benefits.length} benefits) to ${out}`);
