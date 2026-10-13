import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Columns banner: text cell (heading + paragraph) | image cell, on a full-width grey band.
 * Authors may omit the image or the text, swap the cell order, or add stray rows;
 * cells are classified by their content rather than by position.
 * No options are defined for this block yet.
 * @param {Element} block
 */
export default function decorate(block) {
  const row = block.firstElementChild;
  if (!row) return;
  row.classList.add('columns-banner-row');

  // fold any extra rows' cells into the first row so a stray row doesn't break the layout
  [...block.children].slice(1).forEach((extra) => {
    [...extra.children].forEach((cell) => row.append(cell));
    extra.remove();
  });

  let hasImage = false;
  let hasText = false;
  [...row.children].forEach((cell) => {
    const pic = cell.querySelector('picture');
    const text = [...cell.children].some((el) => el.tagName !== 'PICTURE' && !el.querySelector('picture') && el.textContent.trim())
      || [...cell.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());

    if (pic && !text && !hasImage) {
      hasImage = true;
      cell.classList.add('columns-banner-image');
      const img = pic.querySelector('img');
      if (img) {
        pic.replaceWith(createOptimizedPicture(img.src, img.alt, true, [
          { media: '(min-width: 600px)', width: '1200' },
          { width: '750' },
        ]));
      }
    } else if (text || pic) {
      hasText = true;
      cell.classList.add('columns-banner-text');
    } else {
      // empty cell: drop it so it doesn't take up a grid column
      cell.remove();
    }
  });

  if (!hasImage) block.classList.add('columns-banner-no-image');
  if (!hasText) block.classList.add('columns-banner-no-text');
}
