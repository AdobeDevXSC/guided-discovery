// eslint-disable-next-line import/no-cycle
import { decorateMain } from '../../scripts/scripts.js';
import { loadSections } from '../../scripts/aem.js';

/**
 * Fetches the nav fragment: /content first (local preview), then the site root (DA/EDS).
 * @returns {Promise<HTMLElement|null>} decorated fragment root, or null if unavailable
 */
async function loadNavFragment() {
  let resp = await fetch('/content/nav.plain.html');
  if (!resp.ok) resp = await fetch('/nav.plain.html');
  if (!resp.ok) return null;

  const main = document.createElement('main');
  main.innerHTML = await resp.text();

  // resolve relative media against the fragment location, not the current page
  const base = new URL(resp.url, window.location);
  main.querySelectorAll('img[src]').forEach((img) => {
    img.src = new URL(img.getAttribute('src'), base).href;
  });
  main.querySelectorAll('source[srcset]').forEach((source) => {
    source.srcset = new URL(source.getAttribute('srcset'), base).href;
  });

  decorateMain(main);
  await loadSections(main);
  return main;
}

/**
 * Names nav sections by position: first is the brand, last holds the tools,
 * anything in between is a link section.
 * @param {Element} nav The nav element
 */
function classifySections(nav) {
  const sections = [...nav.children];
  sections.forEach((section, i) => {
    if (i === 0) section.classList.add('nav-brand');
    else if (i === sections.length - 1) section.classList.add('nav-tools');
    else section.classList.add('nav-sections');
  });
}

/**
 * loads and decorates the header
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const fragment = await loadNavFragment();
  block.textContent = '';
  if (!fragment) return;

  const nav = document.createElement('nav');
  nav.id = 'nav';
  nav.setAttribute('aria-label', 'Main');
  while (fragment.firstElementChild) nav.append(fragment.firstElementChild);
  classifySections(nav);

  // a logo image is presentational branding; keep its alt for screen readers
  nav.querySelectorAll('.nav-brand img').forEach((img) => {
    img.loading = 'eager';
  });

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);
}
