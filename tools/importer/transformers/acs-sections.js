/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: ACS section breaks + Section Metadata.
 * Uses payload.template.sections (page-templates.json). Section selectors verified in
 * migration-work/cleaned.html: section.hero, .stats-band#stats-section,
 * section#how-it-works, section.closing#discovery.
 *
 * Anchor-target sections also get an `id` row so in-page links
 * (#how-it-works, #discovery) keep working; scripts.js applies it to the section.
 */
const SECTION_MARKER_ATTR = 'data-excat-section-id';

// Section id (template) -> anchor id on the source element
const SECTION_ANCHOR_IDS = {
  rc3: 'how-it-works',
  rc4: 'discovery',
};

function querySection(root, selectors) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function metadataCells(section) {
  const cells = {};
  if (section.style) cells.style = section.style;
  if (SECTION_ANCHOR_IDS[section.id]) cells.id = SECTION_ANCHOR_IDS[section.id];
  return cells;
}

export default function transform(hookName, element, payload) {
  const sections = (payload && payload.template && payload.template.sections) || [];
  if (sections.length < 2) return;
  const doc = element.ownerDocument || document;

  if (hookName === 'beforeTransform') {
    // Insert breaks/markers while every section element still exists (before parsers run).
    for (let i = sections.length - 1; i >= 0; i -= 1) {
      const section = sections[i];
      const hasMeta = Object.keys(metadataCells(section)).length > 0;
      if (i === 0 && !hasMeta) continue;
      const sectionEl = querySection(element, section.selector);
      if (!sectionEl) continue;

      const hr = doc.createElement('hr');
      if (hasMeta) hr.setAttribute(SECTION_MARKER_ATTR, section.id);
      sectionEl.before(hr);
    }
  }

  if (hookName === 'afterTransform') {
    for (let i = sections.length - 1; i >= 0; i -= 1) {
      const section = sections[i];
      const cells = metadataCells(section);
      if (Object.keys(cells).length === 0) continue;

      const marker = element.querySelector(`[${SECTION_MARKER_ATTR}="${section.id}"]`);
      const sectionEl = querySection(element, section.selector);
      const anchor = sectionEl || marker;
      if (!anchor) continue;

      const metadataBlock = WebImporter.Blocks.createBlock(doc, {
        name: 'Section Metadata',
        cells,
      });
      // Place metadata at the end of the section's content when the element survived,
      // otherwise right after the marker (section element replaced by a parser).
      if (sectionEl) sectionEl.after(metadataBlock);
      else marker.after(metadataBlock);

      if (marker) {
        marker.removeAttribute(SECTION_MARKER_ATTR);
        if (i === 0) marker.remove();
      }
    }
  }
}
