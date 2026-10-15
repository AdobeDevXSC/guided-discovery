/* eslint-disable no-console */
/**
 * Seeds the Discovery structured content document (schema: guided-discovery-section) from the
 * existing copy source and catalog, so the structured-content test starts with today's copy.
 *
 * Usage: node tools/importer/guided-discovery/build-discovery-content.js <output.json>
 *
 * Output is { metadata, data } as the DA structured content editor stores it; convert it to DA
 * HTML with @adobe/da-sc-sdk convertJsonToHtml before uploading to /forms/guided-discovery/.
 */
const fs = require('fs');
const path = require('path');

const out = process.argv[2];
if (!out) {
  console.error('Usage: node build-discovery-content.js <output.json>');
  process.exit(1);
}

const copy = JSON.parse(fs.readFileSync(path.join(__dirname, 'copy.source.json'), 'utf8'));
const ui = Object.fromEntries(copy.ui.map((r) => [r.key, r.text]));
const prompts = Object.fromEntries(copy.prompts.map((p) => [p.id, p]));

// From blocks/guided-discovery/lib/catalog.js (kept here so this stays a plain Node script).
const NEED_BUCKET = {
  personalization: 'activation',
  messaging: 'activation',
  'content-supply-chain': 'analysis',
  segmentation: 'both',
  'brand-visibility': 'analysis',
  'customer-experience': 'both',
  'modernizing-docs': 'analysis',
  'real-time-activation': 'activation',
  'cross-channel-measurement': 'analysis',
  'governance-compliance': 'both',
};
const NEED_TO_CAPABILITY = {
  personalization: ['ai-capabilities'],
  messaging: ['journey-mapping'],
  'content-supply-chain': ['content-analytics'],
  segmentation: ['graph-stitching'],
  'brand-visibility': ['attribution'],
  'customer-experience': ['journey-mapping'],
  'modernizing-docs': ['data-transformations'],
  'real-time-activation': ['ai-capabilities', 'connected-data'],
  'cross-channel-measurement': ['attribution', 'graph-stitching'],
  'governance-compliance': ['data-transformations'],
};
const STARTING = ['success', 'pain', 'fix-one-thing', 'stakeholders'];
const DEEPER = ['journey-dropoff', 'segment-dropoff', 'gap-type', 'detection-speed', 'urgency'];
const SINGLE = new Set(['fix-one-thing', 'journey-dropoff', 'segment-dropoff', 'gap-type', 'detection-speed', 'urgency']);

const promptQuestion = (id, groupHeading) => {
  const p = prompts[id];
  return {
    ...(groupHeading ? { groupHeading } : {}),
    id,
    display: SINGLE.has(id) ? 'chips-single' : 'chips-multi',
    title: p.question,
    options: p.options.map((o, i) => ({
      id: o.id,
      label: o.label,
      ...(p.captions && p.captions[i] ? { caption: p.captions[i] } : {}),
    })),
  };
};

const data = {
  sectionId: 'discovery',
  eyebrow: ui['discovery.eyebrow'],
  heading: ui['discovery.heading'],
  intro: ui['discovery.intro'],
  hint: ui['discovery.hint'],
  continueText: ui['discovery.continueText'],
  continueLabel: ui['section.continue'],
  completedLabel: ui['section.completed'],
  questions: [
    {
      id: 'focus',
      display: 'cards-single',
      title: ui['discovery.focusHeading'],
      help: ui['discovery.focusText'],
      required: true,
      options: copy.buckets.map((b) => ({ id: b.id, label: b.name, description: b.description })),
    },
    {
      id: 'needs',
      display: 'cards-multi',
      title: ui['discovery.needsHeading'],
      help: ui['discovery.needsText'],
      required: true,
      filterByQuestion: 'focus',
      options: copy.needs.map((n) => ({
        id: n.id,
        label: n.name,
        description: n.description,
        bucket: NEED_BUCKET[n.id],
        capabilities: NEED_TO_CAPABILITY[n.id],
      })),
    },
    ...STARTING.map((id, i) => promptQuestion(id, i === 0 ? ui['discovery.openHeading'] : '')),
    ...DEEPER.map((id, i) => promptQuestion(id, i === 0 ? ui['discovery.deeperHeading'] : '')),
  ],
};

const doc = { metadata: { schemaName: 'guided-discovery-section', title: 'Discovery' }, data };
fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote ${data.questions.length} questions to ${out}`);
