/* Discovery (copy doc 5.4): focus bucket, needs, and the starting / deeper questions. */
import { h, chip } from '../lib/dom.js';
import { BUCKETS, NEEDS, PROMPTS } from '../lib/catalog.js';
import {
  header, footer, promptBlock, toggleIn,
} from './common.js';

export default function renderDiscovery(ctx) {
  const { copy, store } = ctx;
  const { t } = copy;
  const d = store.state.sections.discovery;
  const update = (fn) => store.update('discovery', fn);

  // needs relevant to the chosen focus first; "Both" (or no focus) shows them all
  const showAll = ctx.ui.showAllNeeds || !d.focus || d.focus === 'both';
  const visibleNeeds = NEEDS.filter((n) => showAll || n.bucket === d.focus || n.bucket === 'both' || d.needs.includes(n.id));

  return h(
    'section',
    { class: 'gd-discovery' },
    header(ctx, { eyebrow: 'discovery.eyebrow', heading: 'discovery.heading', intro: 'discovery.intro' }),
    h(
      'fieldset',
      { class: 'gd-block' },
      h('legend', { text: t('discovery.focusHeading') }),
      h('p', { class: 'gd-help', text: t('discovery.focusText') }),
      h('div', { class: 'gd-cards gd-buckets', role: 'radiogroup' }, BUCKETS.map((id) => {
        const b = copy.item('buckets', id);
        const on = d.focus === id;
        return h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(on),
            class: `gd-card gd-select${on ? ' is-on' : ''}`,
            onClick: () => update((s) => { s.focus = on ? null : id; }),
          },
          h('strong', { text: b.name }),
          h('span', { text: b.description }),
        );
      })),
    ),
    h(
      'fieldset',
      { class: 'gd-block' },
      h('legend', { text: t('discovery.needsHeading') }),
      h('p', { class: 'gd-help', text: t('discovery.needsText') }),
      h('div', { class: 'gd-cards gd-needs' }, visibleNeeds.map(({ id }) => {
        const n = copy.item('needs', id);
        const on = d.needs.includes(id);
        return h(
          'button',
          {
            type: 'button', 'aria-pressed': String(on), class: `gd-card gd-select${on ? ' is-on' : ''}`, onClick: () => update((s) => toggleIn(s.needs, id)),
          },
          h('strong', { text: n.name }),
          h('span', { text: n.description }),
        );
      })),
      !showAll && chip(t('df.allNeeds'), false, () => { ctx.ui.showAllNeeds = true; ctx.rerender(); }, { class: 'gd-chip-more' }),
    ),
    h('h3', { class: 'gd-subhead', text: t('discovery.openHeading') }),
    PROMPTS.filter((p) => p.group === 'open').map((p) => promptBlock(ctx, p, d.answers, (fn) => update((s) => fn(s.answers)))),
    h('h3', { class: 'gd-subhead', text: t('discovery.deeperHeading') }),
    PROMPTS.filter((p) => p.group === 'deeper').map((p) => promptBlock(ctx, p, d.answers, (fn) => update((s) => fn(s.answers)))),
    h('h3', { class: 'gd-subhead', text: t('discovery.routesHeading') }),
    h('ul', { class: 'gd-routes' }, copy.list('routes').map((r) => h('li', {}, h('button', {
      type: 'button', class: 'gd-link', onClick: () => ctx.go(r.id), text: r.label,
    }), h('span', { text: ` - ${r.note}` })))),
    h('p', { class: 'gd-hint', text: t('discovery.hint') }),
    footer(ctx, 'discovery', { text: 'discovery.continueText', canContinue: Boolean(d.focus && d.needs.length) }),
  );
}
