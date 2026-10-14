/* Overview (copy doc 5.3): benefits, what you get, and the progress checklist. */
import { h } from '../lib/dom.js';
import { WORKFLOW } from '../lib/store.js';

export default function renderOverview(ctx) {
  const { t } = ctx.copy;
  const { state } = ctx.store;
  const done = ctx.store.completedCount();
  const total = WORKFLOW.length;
  let cta = t('overview.ctaContinue');
  if (done === 0) cta = t('overview.ctaStart');
  else if (done === total) cta = t('overview.ctaDone');
  const nextPage = WORKFLOW.find((p) => !state.progress.completed.includes(p));

  return h(
    'section',
    { class: 'gd-overview' },
    h('h2', { tabindex: '-1', class: 'gd-focus-target', text: t('overview.benefitsHeading') }),
    h('div', { class: 'gd-cards gd-benefits' }, [1, 2, 3].map((n) => h(
      'article',
      { class: 'gd-card' },
      h('h3', { text: t(`overview.benefit${n}.title`) }),
      h('p', { text: t(`overview.benefit${n}.text`) }),
    ))),
    h('p', { class: 'gd-lead-in', text: t('overview.turnsInto') }),
    h('ul', { class: 'gd-outputs' }, [1, 2, 3].map((n) => h('li', { text: t(`overview.output${n}`) }))),
    h(
      'div',
      { class: 'gd-progress-card' },
      h('h3', { text: t(done === 0 ? 'overview.progressZero' : 'overview.progressHeading') }),
      h('p', { class: 'gd-progress-count', text: t('overview.progressCount', { n: done, total }) }),
      h('progress', { max: String(total), value: String(done), 'aria-label': t('overview.progressCount', { n: done, total }) }),
      h('ul', { class: 'gd-checklist' }, WORKFLOW.map((p) => {
        const isDone = state.progress.completed.includes(p);
        return h('li', { class: isDone ? 'is-done' : '' }, h('button', {
          type: 'button', class: 'gd-link', onClick: () => ctx.go(p), text: t(`nav.${p}`),
        }), isDone && h('span', { class: 'gd-sr', text: ` (${t('section.completed')})` }));
      })),
      h('button', {
        type: 'button', class: 'gd-btn gd-btn-primary', onClick: () => ctx.go(nextPage || 'summary'), text: cta,
      }),
    ),
  );
}
