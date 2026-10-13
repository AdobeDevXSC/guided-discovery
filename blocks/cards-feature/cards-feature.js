import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Cards feature: each row is one card — picture | h3 + paragraph.
 * Cells are classified by content, so a card without an image (or with the image
 * authored inside the text cell) still renders. No options are defined yet.
 * @param {Element} block
 */
export default function decorate(block) {
  const ul = document.createElement('ul');

  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    li.className = 'cards-feature-card';

    [...row.children].forEach((cell) => {
      if (!cell.textContent.trim() && !cell.querySelector('picture, img')) return;
      const pics = cell.querySelectorAll('picture');
      const onlyPicture = pics.length === 1 && !cell.textContent.trim();
      if (onlyPicture) {
        cell.className = 'cards-feature-card-image';
      } else {
        cell.className = 'cards-feature-card-body';
        // an image authored inside the body cell is lifted into its own image cell
        if (pics.length && !li.querySelector('.cards-feature-card-image')) {
          const imgCell = document.createElement('div');
          imgCell.className = 'cards-feature-card-image';
          const pic = pics[0];
          const holder = pic.parentElement;
          imgCell.append(pic);
          const emptyHolder = !holder.textContent.trim() && !holder.children.length;
          if (holder !== cell && emptyHolder) holder.remove();
          li.append(imgCell);
        }
      }
      li.append(cell);
    });

    if (li.children.length) ul.append(li);
  });

  ul.querySelectorAll('picture > img').forEach((img) => {
    img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]));
  });

  // keep the image before the body regardless of authored cell order
  ul.querySelectorAll('.cards-feature-card').forEach((li) => {
    const image = li.querySelector(':scope > .cards-feature-card-image');
    if (image && image !== li.firstElementChild) li.prepend(image);
  });

  block.replaceChildren(ul);
}
