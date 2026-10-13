import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Columns hero: text cell (eyebrow, h1, sub, CTAs) | image cell.
 * Authors may omit the eyebrow, the CTAs, or the image; cells are classified by content.
 * No options are defined for this block yet.
 * @param {Element} block
 */
export default function decorate(block) {
  const row = block.firstElementChild;
  if (!row) return;
  row.classList.add('columns-hero-row');

  // fold any extra rows' cells into the first row so a stray row doesn't break the layout
  [...block.children].slice(1).forEach((extra) => {
    [...extra.children].forEach((cell) => row.append(cell));
    extra.remove();
  });

  const cells = [...row.children];
  let textCell = null;
  cells.forEach((cell) => {
    const pic = cell.querySelector('picture');
    const hasText = [...cell.children].some((el) => !el.querySelector('picture') && el.tagName !== 'PICTURE' && el.textContent.trim());
    if (pic && !hasText) {
      cell.classList.add('columns-hero-image');
      const img = pic.querySelector('img');
      if (img) {
        pic.replaceWith(createOptimizedPicture(img.src, img.alt, true, [{ media: '(min-width: 900px)', width: '1200' }, { width: '750' }]));
      }
    } else if (!textCell) {
      textCell = cell;
      cell.classList.add('columns-hero-text');
    } else {
      cell.classList.add('columns-hero-text');
    }
  });

  if (!textCell) return;

  // eyebrow: a plain paragraph that precedes the heading
  const heading = textCell.querySelector('h1, h2, h3');
  if (heading) {
    const first = textCell.firstElementChild;
    if (first && first !== heading && first.tagName === 'P' && !first.querySelector('a, picture')) {
      first.classList.add('columns-hero-eyebrow');
    }
  }

  // group consecutive CTA paragraphs into one row
  const ctaParas = [...textCell.querySelectorAll(':scope > p')].filter((p) => {
    const links = p.querySelectorAll('a');
    return links.length > 0 && p.textContent.trim() === [...links].map((a) => a.textContent).join('').trim();
  });
  if (ctaParas.length) {
    const actions = document.createElement('div');
    actions.className = 'columns-hero-actions';
    ctaParas[0].before(actions);
    ctaParas.forEach((p) => actions.append(p));
  }

  if (!row.querySelector('.columns-hero-image')) block.classList.add('columns-hero-no-image');
}
