/* eslint-disable */
/* global WebImporter */
/**
 * Parser for cards-steps. Base: cards (no images). Template: acs-assessment.
 * Selector: .gate-howitworks
 * Structure: one row per .gate-step, 1 cell: <p>{step number}</p><p>{step text}</p>.
 * The step text is a bare text node following .gate-step-num inside .gate-step.
 * Number is optional (the block numbers by position if omitted).
 */
export default function parse(element, { document }) {
  let steps = [...element.querySelectorAll(':scope > .gate-step')];
  if (!steps.length) steps = [...element.querySelectorAll('.gate-step, [class*="step"]:not([class*="num"])')];

  const cells = [];
  steps.forEach((step) => {
    const numEl = step.querySelector('.gate-step-num, [class*="num"]');
    const number = numEl ? numEl.textContent.trim() : '';

    const clone = step.cloneNode(true);
    const cloneNum = clone.querySelector('.gate-step-num, [class*="num"]');
    if (cloneNum) cloneNum.remove();
    const text = clone.textContent.replace(/\s+/g, ' ').trim();

    if (!number && !text) return;

    const cell = [];
    if (number) {
      const p = document.createElement('p');
      p.textContent = number;
      cell.push(p);
    }
    if (text) {
      const p = document.createElement('p');
      p.textContent = text;
      cell.push(p);
    }
    cells.push([cell]);
  });

  if (!cells.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-steps', cells });
  element.replaceWith(block);
}
