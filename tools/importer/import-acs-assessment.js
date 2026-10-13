/* eslint-disable */
/* global WebImporter */

// PARSER IMPORTS
import columnsBannerParser from './parsers/columns-banner.js';
import cardsStepsParser from './parsers/cards-steps.js';
import formParser from './parsers/form.js';

// TRANSFORMER IMPORTS
// Only this template's transformers: acs-cleanup.js removes iframes before parsing
// (which would empty the form block) and acs-sections.js would add duplicate breaks.
import acsAssessmentCleanupTransformer from './transformers/acs-assessment-cleanup.js';
import acsAssessmentSectionsTransformer from './transformers/acs-assessment-sections.js';

// PARSER REGISTRY
const parsers = {
  'columns-banner': columnsBannerParser,
  'cards-steps': cardsStepsParser,
  form: formParser,
};

// PAGE TEMPLATE CONFIGURATION - Embedded from page-templates.json
const PAGE_TEMPLATE = {
  name: 'acs-assessment',
  description: 'Assessment gate page: split hero, 3 numbered how-it-works steps, contact form (form block backed by a sheet).',
  urls: [
    'https://landing.adobe.com/acs/CJA-migration-assessment.html',
  ],
  blocks: [
    {
      name: 'columns-banner',
      instances: ['main > section.hero > .wrap', 'section.hero .wrap'],
    },
    {
      name: 'cards-steps',
      instances: ['main > .gate-howitworks', '.gate-howitworks'],
    },
    {
      name: 'form',
      instances: ['main > .form-slot', '.formFieldSection'],
    },
  ],
  sections: [
    {
      id: 'rc1',
      name: 'hero',
      selector: ['main > section.hero', 'section.hero'],
      style: null,
      blocks: ['columns-banner'],
      defaultContent: [],
    },
    {
      id: 'rc2',
      name: 'assessment-gate',
      selector: ['main > .gate-howitworks', '.gate-howitworks'],
      style: null,
      blocks: ['cards-steps', 'form'],
      defaultContent: [],
    },
  ],
};

// TRANSFORMER REGISTRY - cleanup first, then sections (template has 2+ sections)
const transformers = [
  acsAssessmentCleanupTransformer,
  ...(PAGE_TEMPLATE.sections && PAGE_TEMPLATE.sections.length > 1 ? [acsAssessmentSectionsTransformer] : []),
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
    // source page sits on a light grey (#f7f8fa) background: theme "subtle" adds body.subtle
    // (lowercase key: local preview keeps key case and getMetadata matches name="theme")
    const meta = WebImporter.Blocks.getMetadata(document) || {};
    meta.theme = 'subtle';
    main.append(WebImporter.Blocks.getMetadataBlock(document, meta));
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
