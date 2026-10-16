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

// From ./catalog.js (kept here so this stays a plain Node script).
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
// Presentation from the live app: sliders (stops + gauge) and focus-based ordering.
const SLIDERS = { 'journey-dropoff': { stops: 4, gauge: 'journey' }, 'detection-speed': { stops: 5, gauge: 'clock' } };
const FIRST_FOR_FOCUS = { pain: 'analysis', success: 'activation' };
const BUCKET_TAG = { analysis: 'Analysis', activation: 'Activation', both: 'Analysis + Activation' };

const promptQuestion = (id, groupHeading) => {
  const p = prompts[id];
  const slider = SLIDERS[id];
  let display = SINGLE.has(id) ? 'chips-single' : 'chips-multi';
  if (slider) display = 'slider';
  return {
    ...(groupHeading ? { groupHeading } : {}),
    id,
    display,
    ...(slider ? { sliderStops: slider.stops, gauge: slider.gauge } : {}),
    ...(FIRST_FOR_FOCUS[id] ? { firstForFocus: FIRST_FOR_FOCUS[id] } : {}),
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
  labels: {
    startHeading: 'Ready when you are',
    start: 'Start →',
    resume: 'Continue →',
    next: 'Next →',
    back: '← Back',
    done: 'Done',
    questionCount: 'Question {n} of {total}',
    selectOne: 'Select one',
    selectAll: 'Select all that apply',
    swipeHint: 'Swipe left (or tap ✕) for no - right (or tap ✓) for yes.',
    swipeCount: '{n} of {total}',
    optionalCount: '{n} more, optional',
    sliderHint: 'Drag to answer, or tap a point on the line',
    yes: 'Yes',
    no: 'No',
    close: 'Close',
  },
  questions: [
    {
      id: 'focus',
      display: 'cards-single',
      title: ui['discovery.focusHeading'],
      help: ui['discovery.focusText'],
      required: true,
      // each focus card carries its own bucket, so it gets the blue / amber / purple accent
      options: copy.buckets.map((b) => ({
        id: b.id, label: b.name, description: b.description, bucket: b.id,
      })),
    },
    {
      id: 'needs',
      display: 'swipe',
      title: ui['discovery.needsHeading'],
      help: ui['discovery.needsText'],
      required: true,
      filterByQuestion: 'focus',
      outsideTitle: 'A few more, outside your focus',
      outsideMessage: "That covers what's most relevant to your focus. There are a few more outside it - want to see those too?",
      options: copy.needs.map((n) => ({
        id: n.id,
        label: n.name,
        tag: BUCKET_TAG[NEED_BUCKET[n.id]],
        description: n.description,
        bucket: NEED_BUCKET[n.id],
        capabilities: NEED_TO_CAPABILITY[n.id],
      })),
    },
    // the live app's guided step title (its inline heading reads "A few starting questions")
    ...STARTING.map((id, i) => promptQuestion(id, i === 0 ? 'A few questions to start' : '')),
    ...DEEPER.map((id, i) => promptQuestion(id, i === 0 ? ui['discovery.deeperHeading'] : '')),
  ],
};

const doc = { metadata: { schemaName: 'guided-discovery-section', title: 'Discovery' }, data };
fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote ${data.questions.length} questions to ${out}`);
