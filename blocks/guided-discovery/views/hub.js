/* Build Your Profile hub (copy doc 5.5): the six signals, connectable in any order. */
import { h } from '../lib/dom.js';
import { HUB_PAGES } from '../lib/catalog.js';
import { header } from './common.js';

export default function renderHub(ctx) {
  const { copy, store } = ctx;
  const { t } = copy;
  const { completed } = store.state.progress;
  const nextOpen = HUB_PAGES.find((p) => !completed.includes(p));

  return h(
    'section',
    { class: 'gd-hub' },
    header(ctx, { eyebrow: 'hub.eyebrow', heading: 'hub.heading', intro: 'hub.intro' }),
    h('h3', { class: 'gd-subhead', text: t('hub.signalsHeading') }),
    h('div', { class: 'gd-cards gd-signals' }, HUB_PAGES.map((page) => {
      const node = copy.item('hub', page);
      const done = completed.includes(page);
      return h(
        'button',
        { type: 'button', class: `gd-card gd-signal${done ? ' is-done' : ''}`, onClick: () => ctx.go(page) },
        h('strong', { text: node.label }),
        h('span', { text: node.description }),
        done && h('span', { class: 'gd-done-badge', text: t('hub.connected') }),
      );
    })),
    h(
      'div',
      { class: 'gd-section-foot' },
      h('p', { class: 'gd-hint', text: t('hub.footer') }),
      h(
        'div',
        { class: 'gd-actions' },
        nextOpen && h('button', {
          type: 'button', class: 'gd-btn gd-btn-ghost', onClick: () => ctx.go(nextOpen), text: t('section.continue'),
        }),
        h('button', {
          type: 'button', class: 'gd-btn gd-btn-primary', onClick: () => ctx.finish(), text: t('hub.finish'),
        }),
      ),
    ),
  );
}
