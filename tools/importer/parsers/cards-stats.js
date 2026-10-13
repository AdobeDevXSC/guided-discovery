/* eslint-disable */
/* global WebImporter */
/**
 * Parser for cards-stats. Base: cards.
 * Source: https://landing.adobe.com/acs/analytics-modernization-readiness.html
 * Selector: .stats-band .stats-grid
 * Structure: one row per stat item, 1 cell: <p><strong>{value}</strong></p><p>{caption}</p>
 * Live DOM counters may animate from 0; prefer data-* target attributes when the
 * text is empty/zero (or not yet final).
 */
function readValue(numEl) {
  if (!numEl) return '';
  const text = numEl.textContent.replace(/\s+/g, ' ').trim();
  const attrNames = ['data-target', 'data-count', 'data-value', 'data-to', 'data-end', 'data-final'];
  let attr = null;
  for (const name of attrNames) {
    const v = numEl.getAttribute(name);
    if (v !== null && v.trim() !== '') { attr = v.trim(); break; }
  }
  if (attr !== null && (!text || /^0+(\.0+)?$/.test(text.replace(/[^\d.]/g, '')))) {
    // keep any suffix/prefix text the counter renders around the number
    const suffix = numEl.getAttribute('data-suffix') || '';
    const prefix = numEl.getAttribute('data-prefix') || '';
    return `${prefix}${attr}${suffix}`;
  }
  return text || attr || '';
}

export default function parse(element, { document }) {
  const items = [...element.querySelectorAll(':scope > div, :scope > li')];
  const cells = [];

  items.forEach((item) => {
    const numEl = item.querySelector('.num, .counter, [class*="value"], strong');
    const capEl = item.querySelector('p.cap, .cap, p');
    const value = readValue(numEl);
    const caption = capEl && capEl !== numEl ? capEl.textContent.replace(/\s+/g, ' ').trim() : '';
    if (!value && !caption) return;

    const cell = [];
    if (value) {
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = value;
      p.append(strong);
      cell.push(p);
    }
    if (caption) {
      const p = document.createElement('p');
      p.textContent = caption;
      cell.push(p);
    }
    cells.push([cell]);
  });

  if (!cells.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-stats', cells });
  element.replaceWith(block);
}
