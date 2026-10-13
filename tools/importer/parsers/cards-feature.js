/* eslint-disable */
/* global WebImporter */
/**
 * Parser for cards-feature. Base: cards.
 * Source: https://landing.adobe.com/acs/analytics-modernization-readiness.html
 * Selector: #how-it-works .feature-row
 * Structure: one row per .feature, 2 cells: [image] | [h3 + p]
 * Heading text is trimmed (source has trailing spaces).
 */
export default function parse(element, { document }) {
  let items = [...element.querySelectorAll(':scope > .feature')];
  if (!items.length) items = [...element.querySelectorAll(':scope > div')];

  const cells = [];
  items.forEach((item) => {
    const img = item.querySelector('img');
    const headingSrc = item.querySelector('h3, h2, h4');
    const paras = [...item.querySelectorAll('p')].filter((p) => p.textContent.trim());

    const body = [];
    if (headingSrc && headingSrc.textContent.trim()) {
      const h = document.createElement(headingSrc.tagName.toLowerCase());
      h.textContent = headingSrc.textContent.replace(/\s+/g, ' ').trim();
      body.push(h);
    }
    paras.forEach((p) => {
      const np = document.createElement('p');
      np.innerHTML = p.innerHTML.trim();
      body.push(np);
    });

    if (!img && !body.length) return;
    cells.push([img || '', body.length ? body : '']);
  });

  if (!cells.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-feature', cells });
  element.replaceWith(block);
}
