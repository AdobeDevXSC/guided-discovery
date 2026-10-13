/* eslint-disable */
/* global WebImporter */
/**
 * Parser for columns-banner. Base: columns. Template: acs-assessment.
 * Selector: section.hero .wrap
 * Structure: 1 row x 2 cells.
 *   Cell 1: h1 + p.hero-sub (from .hero-copy)
 *   Cell 2: .collage img (decorative; alt cleared — source alt "worshop banner" is a typo)
 * Every part is optional; the block is skipped only if there is no heading, text, or image.
 */
export default function parse(element, { document }) {
  const copy = element.querySelector('.hero-copy') || element;

  const heading = copy.querySelector('h1, h2');
  const sub = copy.querySelector('p.hero-sub') || copy.querySelector('p');

  const imgContainer = element.querySelector('.collage') || element;
  const image = imgContainer.querySelector('img');

  const hasSub = sub && sub.textContent.trim();
  if (!heading && !hasSub && !image) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const textCell = [];
  if (heading) textCell.push(heading);
  if (hasSub) {
    const p = document.createElement('p');
    p.textContent = sub.textContent.trim();
    textCell.push(p);
  }

  if (image) image.setAttribute('alt', '');

  const cells = [[textCell.length ? textCell : '', image || '']];

  const block = WebImporter.Blocks.createBlock(document, { name: 'columns-banner', cells });
  element.replaceWith(block);
}
