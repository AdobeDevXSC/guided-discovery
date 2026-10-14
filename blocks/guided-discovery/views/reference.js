/* Reference pages (copy doc 5.14, 5.15) and the Glossary / How This Works modals (5.16). */
import { h } from '../lib/dom.js';
import { TIERS } from '../lib/catalog.js';
import { header } from './common.js';

export function renderCrosswalk(ctx) {
  const { copy } = ctx;
  const { t } = copy;
  const q = (ctx.ui.crosswalkQuery || '').trim().toLowerCase();
  const rows = copy.list('crosswalk').filter((r) => !q || `${r.aa} ${r.cja} ${r.notes}`.toLowerCase().includes(q));
  const search = h('input', {
    type: 'search', placeholder: t('crosswalk.search'), 'aria-label': t('crosswalk.search'), value: ctx.ui.crosswalkQuery || '',
  });
  search.addEventListener('input', () => {
    ctx.ui.crosswalkQuery = search.value;
    ctx.rerender({ keepFocus: '.gd-crosswalk input[type=search]' });
  });
  return h(
    'section',
    { class: 'gd-crosswalk' },
    header(ctx, { heading: 'crosswalk.heading' }),
    search,
    h(
      'table',
      { class: 'gd-table' },
      h('thead', {}, h('tr', {}, ['crosswalk.aa', 'crosswalk.cja', 'crosswalk.notes'].map((k) => h('th', { scope: 'col', text: t(k) })))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', { text: r.aa }), h('td', { text: r.cja }), h('td', { text: r.notes })))),
    ),
  );
}

export function renderArchitecture(ctx) {
  const { copy } = ctx;
  const layers = copy.list('architecture');
  return h(
    'section',
    { class: 'gd-architecture' },
    header(ctx, { eyebrow: 'architecture.eyebrow', heading: 'architecture.heading' }),
    h('div', { class: 'gd-cards gd-phases' }, TIERS.map((tier) => h(
      'article',
      { class: 'gd-card' },
      h('h3', { text: copy.item('tiers', tier).name }),
      h('dl', {}, layers.filter((l) => l.phase === tier).map((l) => [h('dt', { text: l.layer }), h('dd', { text: l.components })])),
    ))),
  );
}

/** Opens an accessible modal dialog; returns a close function. */
export function openModal(ctx, title, body) {
  const { t } = ctx.copy;
  const previous = document.activeElement;
  const dialog = h('dialog', { class: 'gd-modal', 'aria-label': title });
  const close = () => {
    dialog.close();
    dialog.remove();
    if (previous && previous.focus) previous.focus();
  };
  dialog.append(
    h('div', { class: 'gd-modal-head' }, h('h2', { text: title }), h('button', {
      type: 'button', class: 'gd-btn gd-btn-ghost', text: t('modal.close'), onClick: close,
    })),
    h('div', { class: 'gd-modal-body' }, body),
  );
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  ctx.root.append(dialog);
  dialog.showModal();
  return close;
}

export function glossaryBody(ctx, focusId) {
  const items = ctx.copy.list('glossary');
  const dl = h('dl', { class: 'gd-glossary' }, items.map((g) => [
    h('dt', { id: `gd-term-${g.id}`, text: g.term }),
    h('dd', { text: g.definition }),
  ]));
  if (focusId) {
    // after openModal attaches the list; setTimeout (not rAF) also runs in background tabs
    setTimeout(() => {
      const el = dl.querySelector(`#gd-term-${CSS.escape(focusId)}`);
      if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('is-focus'); }
    }, 0);
  }
  return dl;
}

export function howBody(ctx) {
  const { t } = ctx.copy;
  return h('dl', { class: 'gd-how' }, [1, 2, 3, 4, 5].map((n) => [h('dt', { text: t(`how.${n}.title`) }), h('dd', { text: t(`how.${n}.text`) })]));
}
