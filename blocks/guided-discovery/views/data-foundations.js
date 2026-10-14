/* Data Foundations (copy doc 5.6): step 1 inventory what AA tracks, step 2 the CJA mapping. */
import { h, chip } from '../lib/dom.js';
import {
  DF_ITEMS, DF_CATEGORIES, DF_QUANTITIES, TIERS,
} from '../lib/catalog.js';
import { header, footer, toggleIn } from './common.js';

function inventory(ctx, df, update) {
  const { copy } = ctx;
  const { t } = copy;
  const f = ctx.ui.df;
  const q = f.query.trim().toLowerCase();
  const rows = DF_ITEMS.filter((item) => {
    const c = copy.item('df-items', item.id);
    if (f.category && item.category !== f.category) return false;
    if (f.complexity && item.complexity !== f.complexity) return false;
    if (f.need && !(item.bucket === f.need || item.bucket === 'both')) return false;
    return !q || `${c.name} ${c.type} ${c.approach}`.toLowerCase().includes(q);
  });

  const select = (key, all, options) => h(
    'select',
    {
      'aria-label': t(all),
      onChange: (e) => { f[key] = e.target.value; ctx.rerender(); },
    },
    h('option', { value: '', text: t(all) }),
    options.map(([v, label]) => h('option', { value: v, selected: f[key] === v, text: label })),
  );
  const search = h('input', {
    type: 'search', placeholder: t('df.search'), 'aria-label': t('df.search'), value: f.query,
  });
  search.addEventListener('input', () => {
    f.query = search.value;
    ctx.rerender({ keepFocus: '.gd-df-filters input[type=search]' });
  });

  return [
    h(
      'div',
      { class: 'gd-df-filters' },
      search,
      select('category', 'df.allCategories', DF_CATEGORIES.map((c) => [c, copy.item('df-categories', c).label])),
      select('complexity', 'df.allComplexity', ['low', 'medium', 'high'].map((c) => [c, t(`df.complexity.${c}`)])),
      select('need', 'df.allNeeds', [['analysis', t('df.needs.analysis')], ['activation', t('df.needs.activation')]]),
    ),
    h('ul', { class: 'gd-df-list' }, rows.map((item) => {
      const c = copy.item('df-items', item.id);
      const on = df.selected.includes(item.id);
      return h(
        'li',
        { class: `gd-df-item${on ? ' is-on' : ''}` },
        h('div', { class: 'gd-df-meta' }, h('strong', { text: c.name }), h('span', { class: 'gd-tag', text: copy.item('df-categories', item.category).label }), h('span', { class: 'gd-tag', text: t(`df.complexity.${item.complexity}`) })),
        chip(on ? t('df.tracked') : t('df.track'), on, () => update((s) => {
          toggleIn(s.selected, item.id);
          if (!s.selected.includes(item.id)) {
            delete s.quantity[item.id];
            s.dataView = s.dataView.filter((x) => x !== item.id);
          }
        })),
        on && h('div', { class: 'gd-df-qty', role: 'radiogroup', 'aria-label': t('df.quantityLabel') }, h('span', { text: t('df.quantityLabel') }), DF_QUANTITIES.map((qty) => chip(
          t(`df.quantity.${qty}`),
          df.quantity[item.id] === qty,
          () => update((s) => {
            if (s.quantity[item.id] === qty) delete s.quantity[item.id];
            else s.quantity[item.id] = qty;
          }),
          { attrs: { role: 'radio', 'aria-checked': String(df.quantity[item.id] === qty) } },
        ))),
      );
    })),
  ];
}

function mapping(ctx, df, update) {
  const { copy } = ctx;
  const { t } = copy;
  const selected = DF_ITEMS.filter((i) => df.selected.includes(i.id));
  if (!selected.length) return [h('p', { class: 'gd-empty', text: t('df.noneSelected') })];
  return TIERS.map((tier) => {
    const items = selected.filter((i) => i.tier === tier);
    if (!items.length) return null;
    const meta = copy.item('tiers', tier);
    return h(
      'section',
      { class: 'gd-tier' },
      h('h3', { text: meta.name }),
      h('p', { class: 'gd-help', text: meta.description }),
      items.map((item) => {
        const c = copy.item('df-items', item.id);
        const inView = df.dataView.includes(item.id);
        return h(
          'article',
          { class: 'gd-card gd-map' },
          h('h4', { text: c.name }),
          h('p', {}, h('strong', { text: `${c.approach}` }), c.field ? h('code', { text: ` ${c.field}` }) : null),
          h('p', { text: c.rationale }),
          c.prereqs && h('p', { class: 'gd-help' }, h('strong', { text: `${t('df.prereqs')}: ` }), c.prereqs),
          chip(inView ? t('df.inDataView') : t('df.addToDataView'), inView, () => update((s) => toggleIn(s.dataView, item.id))),
        );
      }),
    );
  });
}

export default function renderDataFoundations(ctx) {
  const { store } = ctx;
  const df = store.state.sections.dataFoundations;
  const update = (fn) => store.update('dataFoundations', fn);
  const { step } = ctx.ui.df;
  return h(
    'section',
    { class: 'gd-df' },
    header(ctx, { heading: step === 1 ? 'df.heading' : 'df.mappingHeading' }),
    step === 1 ? inventory(ctx, df, update) : mapping(ctx, df, update),
    step === 1
      ? footer(ctx, 'data-foundations', {
        text: 'df.footer',
        markDone: false,
        onContinue: () => { ctx.ui.df.step = 2; ctx.rerender({ top: true }); },
      })
      : footer(ctx, 'data-foundations', { onBack: () => { ctx.ui.df.step = 1; ctx.rerender({ top: true }); } }),
  );
}
