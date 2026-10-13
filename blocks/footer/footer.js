// eslint-disable-next-line import/no-cycle
import { decorateMain } from '../../scripts/scripts.js';
import { loadSections } from '../../scripts/aem.js';

/**
 * Fetches the footer fragment: /content first (local preview), then the site root (DA/EDS).
 * @returns {Promise<HTMLElement|null>} decorated fragment root, or null if unavailable
 */
async function loadFooterFragment() {
  let resp = await fetch('/content/footer.plain.html');
  if (!resp.ok) resp = await fetch('/footer.plain.html');
  if (!resp.ok) return null;

  const main = document.createElement('main');
  main.innerHTML = await resp.text();

  // resolve relative media against the fragment location, not the current page
  const base = new URL(resp.url, window.location);
  main.querySelectorAll('img[src]').forEach((img) => {
    img.src = new URL(img.getAttribute('src'), base).href;
  });

  decorateMain(main);
  await loadSections(main);
  return main;
}

/**
 * Keeps "© <year>" notices current, as the source renders the year at runtime.
 * @param {Element} root The element to scan
 */
function updateCopyrightYear(root) {
  const year = String(new Date().getFullYear());
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (/©\s*\d{4}/.test(node.textContent)) {
      node.textContent = node.textContent.replace(/(©\s*)\d{4}/g, `$1${year}`);
    }
  }
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const fragment = await loadFooterFragment();
  block.textContent = '';
  if (!fragment) return;

  const footer = document.createElement('div');
  footer.className = 'footer-content';
  while (fragment.firstElementChild) footer.append(fragment.firstElementChild);
  updateCopyrightYear(footer);

  block.append(footer);
}
