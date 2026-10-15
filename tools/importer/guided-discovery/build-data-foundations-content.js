/* eslint-disable no-console */
/**
 * Seeds the Data Foundations structured content document (schema: guided-discovery-section) from
 * the copy source and catalog, mirroring the live app: an inventory of what's tracked in Adobe
 * Analytics, then a per-item CJA mapping with "How many of these do you have?".
 *
 * Usage: node tools/importer/guided-discovery/build-data-foundations-content.js <output.json>
 *
 * Output is { metadata, data }; convert with @adobe/da-sc-sdk convertJsonToHtml and upload to
 * /forms/guided-discovery/data-foundations.
 */
const fs = require('fs');
const path = require('path');

const out = process.argv[2];
if (!out) {
  console.error('Usage: node build-data-foundations-content.js <output.json>');
  process.exit(1);
}

(async () => {
  const copy = JSON.parse(fs.readFileSync(path.join(__dirname, 'copy.source.json'), 'utf8'));
  const { DF_ITEMS } = await import(path.join(__dirname, '../../../blocks/guided-discovery/lib/catalog.js'));
  const itemCopy = Object.fromEntries(copy.dfItems.map((i) => [i.id, i]));
  const categoryLabel = Object.fromEntries(copy.dfCategories.map((c) => [c.id, c.label]));
  const tierLabel = Object.fromEntries(copy.tiers.map((t) => [t.id, t.name]));
  const BUCKET_TAG = { analysis: 'Analysis', activation: 'Activation', both: 'Analysis + Activation' };

  // the live app recommends these capabilities when the item is tracked today
  const ITEM_CAPABILITIES = {
    'cross-device': ['graph-stitching'], attribution: ['attribution'], anomaly: ['experimentation'],
  };
  const options = DF_ITEMS.map((item) => {
    const c = itemCopy[item.id];
    const category = categoryLabel[item.category];
    return {
      id: item.id,
      label: c.name,
      tag: BUCKET_TAG[item.bucket],
      subLabel: `${c.type} · ${category}`,
      category,
      complexity: item.complexity,
      tier: tierLabel[item.tier],
      bucket: item.bucket,
      ...(ITEM_CAPABILITIES[item.id] ? { capabilities: ITEM_CAPABILITIES[item.id] } : {}),
      mapping: {
        target: c.approach,
        field: c.field,
        why: c.rationale,
        prereqs: c.prereqs ? c.prereqs.split('; ').filter(Boolean) : [],
      },
    };
  });

  const data = {
    sectionId: 'data-foundations',
    eyebrow: 'Data Foundations',
    heading: 'What are you tracking today in Adobe Analytics?',
    intro: "Select the eVars, props, events and other implementation pieces currently in use. We'll map each one to its Customer Journey Analytics equivalent in the next step.",
    hint: "Select at least one item you're tracking today to continue - beyond that, skip anything you're unsure about.",
    continueText: 'Select what you track, then continue to see the CJA mapping.',
    continueLabel: 'Continue ->',
    completedLabel: 'Section complete',
    labels: {
      startHeading: 'Ready when you are',
      start: 'Start ->',
      resume: 'Continue ->',
      next: 'Next ->',
      back: '<- Back',
      done: 'Done',
      swipeHint: 'Swipe left (or tap ✕) for no - right (or tap ✓) for yes.',
      swipeCount: '{n} of {total}',
      optionalCount: '{n} more, optional',
      itemCount: 'Item {n} of {total}',
      search: 'Search implementation elements...',
      allCategories: 'All categories',
      allComplexity: 'All complexity levels',
      complexityLow: 'Low complexity',
      complexityMedium: 'Medium complexity',
      complexityHigh: 'High complexity',
      allBuckets: 'All needs (analysis + activation)',
      bucketAnalysisFilter: 'Data Analysis focus',
      bucketActivationFilter: 'Data Activation focus',
      bucketAnalysis: 'Analysis',
      bucketActivation: 'Activation',
      bucketBoth: 'Analysis + Activation',
      resultCount: '{n} of {total}',
      noMatches: 'No matches. Try a different search or filter.',
      mappingFrom: 'Adobe Analytics',
      mappingTo: 'Customer Journey Analytics',
      mappingWhy: 'Why:',
      mappingPrereqs: 'Prerequisites:',
      perItemEmpty: 'Select items above to see how each one maps into CJA.',
      yes: 'Yes',
      no: 'No',
      close: 'Close',
    },
    questions: [
      {
        id: 'tracked',
        display: 'inventory',
        title: 'What you track',
        guidedTitle: 'What you track',
        required: true,
        filterByQuestion: 'discovery.focus',
        outsideTitle: 'A few more, outside your focus',
        outsideMessage: "That covers what's most relevant to what you flagged in Discovery. There are a few more items outside that focus - want to go through those too?",
        options,
      },
      {
        groupHeading: 'Recommended Customer Journey Analytics approach',
        id: 'quantity',
        display: 'per-item',
        title: 'How many of these do you have?',
        guidedTitle: 'CJA Mapping',
        help: "Here's how each selected element maps into CJA / XDM, and what it takes to get there.",
        itemsFrom: 'tracked',
        choices: [
          { id: 'one', label: 'One' },
          { id: 'multiple', label: 'Multiple' },
          { id: 'unsure', label: 'Not sure' },
        ],
      },
    ],
  };

  const doc = { metadata: { schemaName: 'guided-discovery-section', title: 'Data Foundations' }, data };
  fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`Wrote ${options.length} inventory items to ${out}`);
})();
