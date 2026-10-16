/* eslint-disable no-console */
/**
 * Seeds the Segmentation, Identity, Governance, Roles and Strategy structured content documents
 * (schema: guided-discovery-section) from the copy source and catalog, mirroring the live app's
 * guided flows and recommendation rules (capabilities live on the options/choices that unlock
 * them).
 *
 * Usage: node tools/importer/guided-discovery/build-sections-content.js <output-dir>
 *
 * Writes <sectionId>.json ({ metadata, data }) per section; convert each with @adobe/da-sc-sdk
 * convertJsonToHtml and upload to /forms/guided-discovery/<sectionId>.
 */
const fs = require('fs');
const path = require('path');

const outDir = process.argv[2];
if (!outDir) {
  console.error('Usage: node build-sections-content.js <output-dir>');
  process.exit(1);
}

const copy = JSON.parse(fs.readFileSync(path.join(__dirname, 'copy.source.json'), 'utf8'));
const prompts = Object.fromEntries(copy.prompts.map((p) => [p.id, p]));
const BUCKET_TAG = { analysis: 'Analysis', activation: 'Activation', both: 'Analysis + Activation' };
// From the live app's data (not in the copy source).
const SEGMENT_BUCKET = {
  'cart-abandoners': 'activation',
  'high-value': 'both',
  multichannel: 'both',
  'content-no-convert': 'activation',
  'churn-risk': 'activation',
  'campaign-responders': 'both',
  'service-interaction': 'analysis',
  'new-vs-returning': 'analysis',
};
const GOV_SEVERITY = {
  'data-labels': 'hard', 'access-groups': 'hard', 'usage-labels': 'soft', consent: 'hard',
};
const ROLE_BUCKET = {
  analyst: 'analysis', marketer: 'activation', engineer: 'both', admin: 'both',
};
const STRATEGY_BUCKET = {
  'strategy-model': 'both', 'strategy-change': 'both', 'strategy-blockers': 'activation', 'strategy-ai': 'activation',
};

const LABELS = {
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
  sortHint: "Swipe left (or ✕) if it's a gap for you, right (or ✓) if it's already in place.",
  swipeCount: '{n} of {total}',
  optionalCount: '{n} more, optional',
  sliderHint: 'Drag to answer, or tap a point on the line',
  ownerLabel: 'Owner today',
  ownerPlaceholder: 'Name or team',
  followUp: 'Needs a follow-up conversation',
  relevantTag: 'Most relevant to your focus',
  roleCount: 'Role {n} of {total}',
  yes: 'Yes',
  no: 'No',
  close: 'Close',
};
const base = (sectionId, extra) => ({
  sectionId,
  continueLabel: 'Continue →',
  completedLabel: 'Section complete',
  focusFrom: 'discovery.focus',
  labels: LABELS,
  ...extra,
});
const promptOptions = (id, caps = {}) => prompts[id].options.map((o, i) => ({
  id: o.id,
  label: o.label,
  ...(prompts[id].captions && prompts[id].captions[i] ? { caption: prompts[id].captions[i] } : {}),
  ...(caps[o.id] ? { capabilities: caps[o.id] } : {}),
}));

const sections = {
  segmentation: base('segmentation', {
    eyebrow: 'Segmentation Rebuild',
    heading: 'Every AA segment can be rebuilt in CJA, and some become far more powerful.',
    intro: 'Flag the patterns worth rebuilding. Each one shows how its container logic changes in CJA.',
    continueText: "Flag the patterns worth rebuilding, then continue when you're ready.",
    questions: [{
      id: 'prioritized',
      display: 'swipe',
      title: 'Flag the ones worth rebuilding',
      guidedTitle: 'Priority to rebuild',
      noteLabel: 'CJA logic:',
      options: copy.segments.map((sg) => ({
        id: sg.id,
        label: sg.name,
        tag: BUCKET_TAG[SEGMENT_BUCKET[sg.id]],
        description: sg.description,
        note: sg.cjaLogic,
        bucket: SEGMENT_BUCKET[sg.id],
      })),
    }],
  }),
  identity: base('identity', {
    eyebrow: 'Identity & Stitching',
    heading: 'How well do you know your customer?',
    intro: "Most AA implementations sit in stage 1 or 2. CJA's value compounds as identity stitching matures.",
    hint: 'Set a Today and a Target stage to continue - nothing else on this page is graded.',
    continueText: "Set your current and target stages above, then continue when you're ready.",
    questions: ['identity-current', 'identity-target'].map((id, i) => ({
      ...(i === 0 ? { groupHeading: 'Identity & Stitching' } : {}),
      id,
      display: 'slider',
      sliderStops: 4,
      gauge: 'journey',
      title: i === 0 ? 'Where are you today, in terms of identity stitching?' : "Where's your target?",
      required: true,
      differentFrom: i === 0 ? 'identity-target' : 'identity-current',
      ...(i === 1 ? { upgradeFrom: 'identity-current', upgradeCapabilities: ['graph-stitching'] } : {}),
      options: copy.identityStages.map((st) => ({
        id: st.id, label: st.name, description: st.short, caption: st.enables,
      })),
    })),
  }),
  governance: base('governance', {
    eyebrow: 'Governance & Access',
    heading: 'Governance moves from report-suite settings to platform-level controls.',
    intro: 'See how each control is enforced in Adobe Experience Platform / CJA, then sort it below.',
    hint: 'Sort at least one control to continue - the rest can wait.',
    continueText: "Sort each control above, then continue when you're ready.",
    questions: [{
      id: 'status',
      display: 'sort',
      title: 'Sort each control',
      guidedTitle: 'Sort each control',
      help: 'Assign a status to as many controls as apply - each one is independent, so more than one can be "In place."',
      required: true,
      noteLabel: 'Example:',
      choices: [
        { id: 'in-place', label: 'Already in place' },
        { id: 'gap', label: 'Gap for us', capabilities: ['data-transformations'] },
      ],
      options: copy.governance.map((g) => ({
        id: g.id,
        label: g.name,
        tag: GOV_SEVERITY[g.id] === 'hard' ? 'Hard control' : 'Soft control',
        description: g.description,
        note: g.example,
      })),
    }],
  }),
  roles: base('roles', {
    eyebrow: 'Roles & Stakeholders',
    heading: 'Migration changes daily workflow for four roles.',
    intro: 'Use this to set expectations with each team before go-live. Note an owner for each role and flag anyone who needs a follow-up conversation.',
    continueText: "Assign owners where you can, then continue when you're ready.",
    questions: [{
      id: 'owners',
      display: 'owner-cards',
      title: 'Roles & Stakeholders',
      filterByQuestion: 'discovery.focus',
      options: copy.roles.map((r) => ({
        id: r.id,
        label: r.name,
        bucket: ROLE_BUCKET[r.id],
        fields: [
          { label: 'Moving from', text: r.from },
          { label: 'Moving to', text: r.to },
          { label: 'New skill to build', text: r.newSkill },
          { label: 'Quick win', text: r.quickWin },
        ],
      })),
    }],
  }),
  'strategy-adoption': base('strategy-adoption', {
    eyebrow: 'Strategy & Adoption',
    heading: 'Data is only as good as what your org does with it.',
    intro: "CJA can answer questions AA never could, but that only pays off if there's a plan for who owns it, how it gets adopted, and what happens once better answers start showing up.",
    hint: 'Answer at least the AI/agentic workflows question to continue - "Not sure yet" counts. Everything else here is optional.',
    continueText: "Once the operating picture feels right, you're ready to continue.",
    questions: [
      ...['strategy-model', 'strategy-change', 'strategy-blockers'].map((id, i) => ({
        ...(i === 0 ? { groupHeading: 'Strategy & Adoption' } : {}),
        id,
        display: id === 'strategy-blockers' ? 'chips-multi' : 'chips-single',
        bucket: STRATEGY_BUCKET[id],
        title: prompts[id].question,
        options: promptOptions(id),
      })),
      {
        id: 'strategy-ai',
        display: 'slider',
        sliderStops: 3,
        gauge: 'signal',
        bucket: STRATEGY_BUCKET['strategy-ai'],
        title: prompts['strategy-ai'].question,
        required: true,
        options: promptOptions('strategy-ai', {
          'not-yet-but-interested': ['ai-capabilities'], 'actively-exploring': ['ai-capabilities'],
        }),
      },
      {
        groupHeading: 'What AI-readiness actually looks like',
        id: 'ai-picks',
        display: 'cards-multi',
        title: 'Which of these would help your team most right now?',
        help: 'Click the ones that would help your team most right now - this feeds directly into your recommendation at the end.',
        options: copy.capabilities.map((c) => ({
          id: c.id, label: c.name, description: c.description, capabilities: [c.id],
        })),
      },
    ],
  }),
};

fs.mkdirSync(outDir, { recursive: true });
Object.entries(sections).forEach(([id, data]) => {
  const title = data.eyebrow;
  fs.writeFileSync(
    path.join(outDir, `${id}.json`),
    `${JSON.stringify({ metadata: { schemaName: 'guided-discovery-section', title }, data }, null, 2)}\n`,
  );
  console.log(`${id}: ${data.questions.length} question(s)`);
});
