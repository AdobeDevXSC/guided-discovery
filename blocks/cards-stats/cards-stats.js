/**
 * Cards stats: each row is one stat — a value (<strong>) and a caption.
 * Tolerates the value and caption being authored in one cell or split across two cells,
 * and a missing <strong> (the first paragraph is then treated as the value).
 * No options are defined for this block yet.
 * @param {Element} block
 */
export default function decorate(block) {
  const ul = document.createElement('ul');

  [...block.children].forEach((row) => {
    // flatten all cell content of the row into one list item
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
    li.className = 'cards-stats-item';
    li.append(...nodes);

    const strong = li.querySelector('strong');
    const valueEl = strong ? strong.closest('li > *') : li.firstElementChild;
    if (valueEl) valueEl.classList.add('cards-stats-value');
    [...li.children].forEach((el) => {
      if (el !== valueEl) el.classList.add('cards-stats-caption');
    });

    ul.append(li);
  });

  block.replaceChildren(ul);
}
