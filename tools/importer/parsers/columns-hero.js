/* eslint-disable */
/* global WebImporter */
/**
 * Parser for columns-hero. Base: columns.
 * Source: https://landing.adobe.com/acs/analytics-modernization-readiness.html
 * Selector: section.hero .wrap
 * Structure: 1 row x 2 cells.
 *   Cell 1: <p>eyebrow</p>, h1, <p>sub</p>, <p><strong><a>primary CTA</a></strong></p>, <p><em><a>secondary CTA</a></em></p>
 *   Cell 2: hero image (.collage img; commented-out imgs are not in the DOM)
 * Every part is optional; the block is skipped only if there is no heading and no image.
 */
export default function parse(element, { document }) {
  const copy = element.querySelector('.hero-copy') || element;

  const kicker = copy.querySelector('.kicker, [class*="eyebrow"]');
  const heading = copy.querySelector('h1, h2');
  const sub = copy.querySelector('p.hero-sub') || copy.querySelector('p');
  const primary = copy.querySelector('a.btn-red, a.btn-primary');
  const secondary = copy.querySelector('a.btn-outline-white, a.btn-outline, a.btn-secondary');

  const imgContainer = element.querySelector('.collage') || element;
  const image = imgContainer.querySelector('img');

  if (!heading && !image) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const makeCta = (link, wrapperTag) => {
    const a = document.createElement('a');
    a.href = link.getAttribute('href') || '#';
    a.textContent = link.textContent.trim();
    const wrap = document.createElement(wrapperTag);
    wrap.append(a);
    const p = document.createElement('p');
    p.append(wrap);
    return p;
  };

  const textCell = [];
  if (kicker && kicker.textContent.trim()) {
    const p = document.createElement('p');
    p.textContent = kicker.textContent.trim();
    textCell.push(p);
  }
  if (heading) textCell.push(heading);
  if (sub && sub.textContent.trim()) {
    const p = document.createElement('p');
    p.textContent = sub.textContent.trim();
    textCell.push(p);
  }
  if (primary) textCell.push(makeCta(primary, 'strong'));
  if (secondary && secondary !== primary) textCell.push(makeCta(secondary, 'em'));

  const cells = [[textCell, image || '']];

  const block = WebImporter.Blocks.createBlock(document, { name: 'columns-hero', cells });
  element.replaceWith(block);
}
