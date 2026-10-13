/* eslint-disable */
/* global WebImporter */

// PARSER IMPORTS
import columnsHeroParser from './parsers/columns-hero.js';
import cardsStatsParser from './parsers/cards-stats.js';
import cardsFeatureParser from './parsers/cards-feature.js';

// TRANSFORMER IMPORTS
import acsCleanupTransformer from './transformers/acs-cleanup.js';
import acsSectionsTransformer from './transformers/acs-sections.js';

// PARSER REGISTRY
const parsers = {
  'columns-hero': columnsHeroParser,
  'cards-stats': cardsStatsParser,
  'cards-feature': cardsFeatureParser,
};

// PAGE TEMPLATE CONFIGURATION - Embedded from page-templates.json
const PAGE_TEMPLATE = {
  name: 'acs',
  description: 'ACS campaign landing page: dark split hero, light stats band, centered intro with feature cards, black closing CTA. Sections #how-it-works and #discovery are in-page anchor targets.',
  urls: [
    'https://landing.adobe.com/acs/analytics-modernization-readiness.html',
  ],
  blocks: [
    {
      name: 'columns-hero',
      instances: ['main > section.hero > .wrap', 'section.hero .wrap'],
    },
    {
      name: 'cards-stats',
      instances: ['.stats-band .stats-grid', '#stats-section .stats-grid'],
    },
    {
      name: 'cards-feature',
      instances: ['#how-it-works .feature-row', 'section .feature-row'],
    },
  ],
  sections: [
    {
      id: 'rc1',
      name: 'hero',
      selector: ['main > section.hero', 'section.hero'],
      style: 'dark',
      blocks: ['columns-hero'],
      defaultContent: [],
    },
    {
      id: 'rc2',
      name: 'stats',
      selector: ['.stats-band', '#stats-section'],
      style: 'light',
      blocks: ['cards-stats'],
      defaultContent: [],
    },
    {
      id: 'rc3',
      name: 'how-it-works',
      selector: ['#how-it-works', 'main > section:has(.feature-row)'],
      style: 'center',
      blocks: ['cards-feature'],
      defaultContent: ['.intro-head h2', '.intro-head p'],
    },
    {
      id: 'rc4',
      name: 'discovery',
      selector: ['section.closing', '#discovery'],
      style: 'black, center',
      blocks: [],
      defaultContent: ['section.closing h2', 'section.closing a.btn'],
    },
  ],
};

// TRANSFORMER REGISTRY - cleanup first, then sections (template has 2+ sections)
const transformers = [
  acsCleanupTransformer,
  ...(PAGE_TEMPLATE.sections && PAGE_TEMPLATE.sections.length > 1 ? [acsSectionsTransformer] : []),
];

/**
 * Execute all page transformers for a specific hook
 * @param {string} hookName - 'beforeTransform' or 'afterTransform'
 * @param {Element} element - The DOM element to transform
 * @param {Object} payload - { document, url, html, params }
 */
function executeTransformers(hookName, element, payload) {
  const enhancedPayload = {
    ...payload,
    template: PAGE_TEMPLATE,
  };

  transformers.forEach((transformerFn) => {
    try {
      transformerFn.call(null, hookName, element, enhancedPayload);
    } catch (e) {
      console.error(`Transformer failed at ${hookName}:`, e);
    }
  });
}

/**
 * Find all blocks on the page based on the embedded template configuration.
 * Selectors for the same block may match the same element; each element is kept once.
 * @param {Document} document - The DOM document
 * @param {Object} template - The embedded PAGE_TEMPLATE object
 * @returns {Array} Block instances found on the page
 */
function findBlocksOnPage(document, template) {
  const pageBlocks = [];
  const seen = new Set();

  template.blocks.forEach((blockDef) => {
    blockDef.instances.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 0) {
        console.warn(`Block "${blockDef.name}" selector not found: ${selector}`);
      }
      elements.forEach((element) => {
        if (seen.has(element)) return;
        seen.add(element);
        pageBlocks.push({
          name: blockDef.name,
          selector,
          element,
          section: blockDef.section || null,
        });
      });
    });
  });

  console.log(`Found ${pageBlocks.length} block instances on page`);
  return pageBlocks;
}

export default {
  transform: (payload) => {
    const { document, url, params } = payload;

    const main = document.body;

    // 1. Initial cleanup + section markers
    executeTransformers('beforeTransform', main, payload);

    // 2. Find blocks on page using embedded template
    const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);

    // 3. Parse each block (skip elements already replaced by an earlier parser)
    pageBlocks.forEach((block) => {
      if (!block.element.parentNode) return;
      const parser = parsers[block.name];
      if (parser) {
        try {
          parser(block.element, { document, url, params });
        } catch (e) {
          console.error(`Failed to parse ${block.name} (${block.selector}):`, e);
        }
      } else {
        console.warn(`No parser found for block: ${block.name}`);
      }
    });

    // 4. Final cleanup + section breaks / section metadata
    executeTransformers('afterTransform', main, payload);

    // 5. WebImporter built-in rules
    const hr = document.createElement('hr');
    main.appendChild(hr);
    WebImporter.rules.createMetadata(main, document);
    WebImporter.rules.transformBackgroundImages(main, document);
    WebImporter.rules.adjustImageUrls(main, url, params.originalURL);

    // 6. Sanitized document path (root maps to /index)
    const rawPath = new URL(params.originalURL).pathname
      .replace(/\/$/, '')
      .replace(/\.html?$/, '');
    const path = WebImporter.FileUtils.sanitizePath(rawPath === '' ? '/index' : rawPath);

    return [{
      element: main,
      path,
      report: {
        title: document.title,
        template: PAGE_TEMPLATE.name,
        blocks: pageBlocks.map((b) => b.name),
      },
    }];
  },
};
