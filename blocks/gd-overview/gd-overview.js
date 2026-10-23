/*
 * gd-overview: the Guided Discovery opening screen, from DA structured content
 * (schema "guided-discovery-overview", see tools/importer/guided-discovery/schemas/).
 *
 * Block config (2-column rows):
 *   Content  | link to the overview document, e.g. /forms/guided-discovery/overview
 *   Endpoint | App Builder guided-discovery action URL (put it here when this is the first
 *              Guided Discovery block on the page)
 *
 * As in the live app: eyebrow, headline, intro, "Benefits of CJA" cards, what the answers turn
 * into, and a progress card. Start opens the first section's guided flow, Continue the next
 * unfinished one, and once every section is complete the button goes to the summary.
 */
import { readBlockConfig } from '../../scripts/aem.js';
import h from '../gd-section/lib/dom.js';
import getSession from '../gd-section/session.js';
import loadStructured from '../gd-section/content.js';
import { fmt } from '../gd-section/widgets.js';

const first = (v) => (Array.isArray(v) ? v[0] : v);
const list = (v) => (Array.isArray(v) ? v : []);

const DEFAULT_LABELS = {
  progressZero: 'Ready when you are',
  progressHeading: 'Your progress in this session',
  progressCount: '{n} of {total} sections complete',
  start: 'Start →',
  resume: 'Continue →',
  done: 'Go to Your Summary & Next Steps →',
};

/** Resolves with the element once a later (lazily decorated) block has rendered it. */
function whenRendered(selector, timeout = 8000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const look = () => {
      const el = document.querySelector(selector);
      if (el || Date.now() - started > timeout) resolve(el);
      else setTimeout(look, 150);
    };
    look();
  });
}

/** Scrolls to a section and opens its guided flow, as the live app's Start / Continue do. */
async function openSection(id) {
  const root = await whenRendered(`#gd-${id}`);
  if (!root) return;
  root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const start = root.querySelector('.gd-start .gd-btn-primary');
  if (start) start.click();
}

async function openSummary() {
  const root = await whenRendered('#gd-summary');
  if (root) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// start code added for picture tag to be loaded from the overview content, so that the benefits cards can have images.
async function getBenefitPictures(contentLink) {
  const url = new URL(contentLink, window.location.href);
  url.pathname = url.pathname.replace(/\.(json|html)$/, '');
  url.pathname += '.plain.html';

  const response = await fetch(url.href);
  if (!response.ok) return [];

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  return [...doc.querySelectorAll('.benefits picture')];
}
// end code
export default async function decorate(block) {
  const cfg = readBlockConfig(block);
  const contentLink = first(cfg.content);
  block.textContent = '';
  if (!contentLink) {
    block.append(h('p', { text: 'The overview is missing its Content link.' }));
    return;
  }

  let overview;
  try {
    overview = await loadStructured(contentLink);
  } catch (e) {
    block.append(h('p', { text: 'The overview could not be loaded. Please reload the page.' }));
    return;
  }
  const labels = { ...DEFAULT_LABELS, ...(overview.labels || {}) };
  const sections = list(overview.sections);
  const benefitPictures = await getBenefitPictures(contentLink);
  const progress = h('div', { class: 'gd-ov-progress', 'aria-live': 'polite' });
  const root = h(
    'div',
    { class: 'gd-ov' },
    overview.eyebrow && h('p', { class: 'gd-ov-eyebrow', text: overview.eyebrow }),
    h('h1', { class: 'gd-ov-heading', text: overview.heading }),
    overview.intro && h('p', { class: 'gd-ov-intro', text: overview.intro }),
    list(overview.benefits).length > 0 && h(
      'div',
      { class: 'gd-ov-benefits' },
      overview.benefitsHeading && h('h2', { text: overview.benefitsHeading }),
      h('ul', { class: 'gd-ov-cards' }, overview.benefits.map((b, index) => h(
        'li',
        { class: `gd-ov-card gd-ov-accent-${b.accent || 'analysis'}` },
        benefitPictures[index]?.cloneNode(true),
        h('h3', { text: b.title }),
        b.text && h('p', { text: b.text }),
      ))),
    ),
    list(overview.outputs).length > 0 && h(
      'div',
      { class: 'gd-ov-outputs' },
      overview.turnsInto && h('p', { text: overview.turnsInto }),
      h('ul', {}, overview.outputs.map((o) => h('li', { text: o }))),
    ),
    progress,
  );
  block.append(root);

  const shared = getSession(first(cfg.endpoint));
  if (shared) await shared.ready;

  const render = () => {
    const completed = shared ? list(shared.store.state.progress.completed) : [];
    const done = sections.filter((s) => completed.includes(s.id));
    const next = sections.find((s) => !completed.includes(s.id));
    const total = sections.length;
    const started = done.length > 0;
    const pct = total ? Math.round((done.length / total) * 100) : 0;

    let action;
    if (!started) {
      action = h('button', {
        type: 'button', class: 'gd-ov-cta', text: labels.start, onClick: () => sections[0] && openSection(sections[0].id),
      });
    } else if (next) {
      action = h('button', {
        type: 'button', class: 'gd-ov-cta', text: labels.resume, onClick: () => openSection(next.id),
      });
    } else {
      action = h('button', {
        type: 'button', class: 'gd-ov-cta', text: labels.done, onClick: openSummary,
      });
    }

    progress.replaceChildren(...[
      h(
        'div',
        { class: 'gd-ov-progress-head' },
        h('h2', { text: started ? labels.progressHeading : labels.progressZero }),
        started && h('span', { class: 'gd-ov-count', text: fmt(labels.progressCount, { n: done.length, total }) }),
      ),
      started && h('ul', { class: 'gd-ov-pills' }, sections.map((s) => {
        const on = completed.includes(s.id);
        return h('li', {}, h(
          'button',
          {
            type: 'button', class: `gd-ov-pill${on ? ' is-done' : ''}`, onClick: () => openSection(s.id),
          },
          h('span', { class: 'gd-ov-pill-check', 'aria-hidden': 'true', text: on ? '✓' : '' }),
          s.label,
        ));
      })),
      started && h('div', { class: 'gd-ov-bar', role: 'img', 'aria-label': fmt(labels.progressCount, { n: done.length, total }) }, h('span', { style: `width:${pct}%` })),
      action,
    ].filter(Boolean));
  };

  if (shared) shared.store.subscribe((kind) => { if (kind === 'progress' || kind === 'result') render(); });
  render();
}
