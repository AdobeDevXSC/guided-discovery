/**
 * Cards steps: each row is one numbered step — a number paragraph and a short description.
 * The number may be authored as its own first paragraph (`<p>1</p>`), as a leading number
 * in the text (`1. Tell us…`), or omitted entirely (the step is then numbered by position).
 * Content split across several cells in a row is merged into one step.
 * No options are defined for this block yet.
 * @param {Element} block
 */
export default function decorate(block) {
  const ol = document.createElement('ol');

  [...block.children].forEach((row) => {
    // flatten all cell content of the row into block-level nodes
    const nodes = [...row.children].flatMap((cell) => {
      const kids = [...cell.childNodes]
        .filter((n) => n.nodeType === Node.ELEMENT_NODE || n.textContent.trim());
      if (kids.length && kids.every((n) => n.nodeType === Node.ELEMENT_NODE)) return kids;
      // bare text in a cell: wrap it in a paragraph
      const p = document.createElement('p');
      p.append(...cell.childNodes);
      return p.textContent.trim() ? [p] : [];
    });
    if (!nodes.length) return;

    const li = document.createElement('li');
    li.className = 'cards-steps-item';

    let number = '';
    const first = nodes[0];
    const firstText = first.textContent.trim();
    if (/^\d{1,3}\.?$/.test(firstText) && nodes.length > 1) {
      number = firstText.replace('.', '');
      nodes.shift();
    } else if (first.tagName === 'P') {
      // leading number inside the text, e.g. "1. Tell us a bit about yourself."
      const match = firstText.match(/^(\d{1,3})[.)]\s+(.+)$/s);
      if (match && first.children.length === 0) {
        const [, num, text] = match;
        number = num;
        first.textContent = text;
      }
    }
    if (!number) number = String(ol.children.length + 1);

    const badge = document.createElement('span');
    badge.className = 'cards-steps-number';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = number;

    const body = document.createElement('div');
    body.className = 'cards-steps-body';
    body.append(...nodes);

    li.append(badge, body);
    ol.append(li);
  });

  block.replaceChildren(ol);
}
