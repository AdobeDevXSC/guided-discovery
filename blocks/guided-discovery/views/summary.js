/* Your Summary & Next Steps (copy doc 5.13): one-pager, answer log, inventory review. Printable. */
import { h, rich } from '../lib/dom.js';
import {
  DF_ITEMS, GOVERNANCE, PROMPTS, ROLES,
} from '../lib/catalog.js';
import { WORKFLOW } from '../lib/store.js';

const row = (label, value) => h('div', { class: 'gd-row' }, h('div', { class: 'gd-row-label', text: label }), h('div', { class: 'gd-row-value' }, value));

function reasonText(ctx, reason) {
  const { copy } = ctx;
  if (reason.code === 'need') return copy.t('reason.need', { ref: copy.item('needs', reason.ref).name });
  return copy.t(`reason.${reason.code}`, { count: reason.count });
}

function inventoryReview(ctx) {
  const { copy, store } = ctx;
  const { t } = copy;
  const inv = store.state.sections.inventoryReview;
  const { selected } = store.state.sections.dataFoundations;
  const tracked = DF_ITEMS.filter((i) => selected.includes(i.id));
  const rowEl = (r, idx) => {
    const name = h('input', {
      type: 'text', value: r.name, maxlength: '200', 'aria-label': t('summary.itemName'), placeholder: t('summary.itemName'),
    });
    const note = h('input', {
      type: 'text', value: r.note, maxlength: '1000', 'aria-label': t('summary.itemNote'), placeholder: t('summary.itemNote'),
    });
    const save = () => store.update('inventoryReview', (s) => { s.added[idx] = { name: name.value, note: note.value }; }, { render: false });
    name.addEventListener('input', save);
    note.addEventListener('input', save);
    return h('li', { class: 'gd-inv-row' }, name, note, h('button', {
      type: 'button', class: 'gd-btn gd-btn-ghost no-print', text: t('summary.remove'), onClick: () => store.update('inventoryReview', (s) => { s.added.splice(idx, 1); }),
    }));
  };
  return h(
    'details',
    { class: 'gd-inventory', open: true },
    h('summary', { text: t('summary.inventoryLabel') }),
    h('p', { class: 'gd-help', text: t('summary.inventoryIntro') }),
    h('ul', { class: 'gd-chips-list' }, tracked.map((i) => h('li', { class: 'gd-chip is-on', text: copy.item('df-items', i.id).name }))),
    h('ul', { class: 'gd-inv' }, inv.added.map(rowEl)),
    h('button', {
      type: 'button', class: 'gd-btn gd-btn-ghost no-print', text: t('summary.addItem'), onClick: () => store.update('inventoryReview', (s) => { s.added.push({ name: '', note: '' }); }),
    }),
  );
}

function answerLog(ctx) {
  const { copy, store } = ctx;
  const { t } = copy;
  const { sections: s } = store.state;
  const list = (vals) => (vals.length ? vals.join(', ') : t('summary.noneSelected'));
  const promptRows = (group, answers) => PROMPTS.filter((p) => p.group === group).map((p) => row(
    copy.item('prompts', p.id).question,
    list((answers[p.id] || []).map((o) => copy.option(p.id, o).label)),
  ));
  const govLabel = (v) => ({ gap: t('gov.gap'), 'in-place': t('gov.inPlace') }[v] || t('summary.notSet'));
  const block = (title, ...rows) => h('section', { class: 'gd-log-block' }, h('h3', { text: title }), rows);
  return h(
    'div',
    { class: 'gd-log' },
    block(
      t('summary.log.discovery'),
      row(t('discovery.focusHeading'), s.discovery.focus ? copy.item('buckets', s.discovery.focus).name : t('summary.notSet')),
      row(t('discovery.needsHeading'), list(s.discovery.needs.map((n) => copy.item('needs', n).name))),
    ),
    block(t('summary.log.heard'), promptRows('open', s.discovery.answers), promptRows('deeper', s.discovery.answers)),
    block(t('nav.data-foundations'), row(t('df.tracked'), list(s.dataFoundations.selected.map((i) => copy.item('df-items', i).name)))),
    block(t('nav.segmentation'), row(t('seg.zone'), list(s.segmentation.prioritized.map((i) => copy.item('segments', i).name)))),
    block(
      t('nav.identity'),
      row(t('identity.today'), s.identity.current ? copy.item('identity-stages', s.identity.current).name : t('summary.notSet')),
      row(t('identity.target'), s.identity.target ? copy.item('identity-stages', s.identity.target).name : t('summary.notSet')),
    ),
    block(t('nav.governance'), GOVERNANCE.map((g) => row(copy.item('governance', g).name, govLabel(s.governance.status[g])))),
    block(t('nav.roles'), ROLES.map((r) => row(copy.item('roles', r).name, `${s.roles.owners[r] || t('summary.notSet')}${s.roles.followUp.includes(r) ? ` · ${t('roles.followUp')}` : ''}`))),
    block(
      t('nav.strategy-adoption'),
      promptRows('strategy', s.strategyAdoption.answers),
      row(t('strategy.aiPrompt'), list(s.strategyAdoption.aiCapabilityPicks.map((c) => copy.item('capabilities', c).name))),
    ),
  );
}

export default function renderSummary(ctx) {
  const { copy, store } = ctx;
  const { t } = copy;
  const { state } = store;
  const s = state.sections;
  const done = store.completedCount();
  const anything = done > 0 || s.discovery.needs.length || s.dataFoundations.selected.length;
  const result = store.preview();
  const submitted = state.status === 'completed';
  const govReviewed = GOVERNANCE.filter((g) => s.governance.status[g]).length;
  const gaps = GOVERNANCE.filter((g) => s.governance.status[g] === 'gap').length;
  const strategyPrompts = PROMPTS.filter((p) => p.group === 'strategy');

  const snapshot = [
    row(t('summary.snap.focus'), s.discovery.focus ? copy.item('buckets', s.discovery.focus).name : t('summary.notSet')),
    row(t('summary.snap.df'), t('summary.snap.dfValue', { n: s.dataFoundations.selected.length, total: DF_ITEMS.length })),
    row(t('summary.snap.gov'), govReviewed ? t('summary.snap.govValue', { n: gaps }) : t('summary.snap.govNone')),
    row(t('summary.snap.roles'), t('summary.snap.rolesValue', { n: Object.keys(s.roles.owners).length, total: ROLES.length })),
    row(t('summary.snap.strategy'), t('summary.snap.strategyValue', { n: strategyPrompts.filter((p) => (s.strategyAdoption.answers[p.id] || []).length).length, total: strategyPrompts.length })),
  ];
  const size = result.engagement;

  return h(
    'section',
    { class: 'gd-summary' },
    h(
      'div',
      { class: 'gd-section-head' },
      h('h2', { tabindex: '-1', class: 'gd-focus-target', text: t('summary.heading') }),
      h('p', { class: 'gd-headline', text: t(`headline.${result.headline}`) }),
      h('p', { class: 'gd-help', text: t('summary.completionNote', { n: done, total: WORKFLOW.length }) }),
      h(
        'div',
        { class: 'gd-actions no-print' },
        !submitted && h('button', {
          type: 'button', class: 'gd-btn gd-btn-primary', text: t('summary.finish'), onClick: (e) => { e.target.disabled = true; e.target.textContent = t('summary.submitting'); ctx.finish(); },
        }),
        h('button', {
          type: 'button', class: 'gd-btn gd-btn-ghost', text: t('summary.downloadPdf'), onClick: () => window.print(),
        }),
      ),
    ),
    submitted && h(
      'div',
      { class: 'gd-thanks', role: 'status' },
      h('h3', { text: t('summary.thanksHeading') }),
      h('p', { text: t('summary.thanksText') }),
      h('ul', {}, ['summary.link1', 'summary.link2', 'summary.link3'].map((k) => h('li', {}, rich(t(k))))),
    ),
    !anything && h('p', { class: 'gd-empty', text: t('summary.empty') }),
    h('section', { class: 'gd-op-block' }, h('h3', { text: t('summary.snapshot') }), snapshot),
    h(
      'section',
      { class: 'gd-op-block' },
      h('h3', { text: t('summary.unlocks') }),
      result.matchedCapabilities.length
        ? h('ul', { class: 'gd-unlocks' }, result.matchedCapabilities.map((m) => h('li', {}, h('strong', { text: copy.item('capabilities', m.id).name }), h('span', { class: 'gd-help', text: ` - ${m.reasons.map((r) => reasonText(ctx, r)).join(' ')}` }))))
        : h('p', { class: 'gd-help', text: t('summary.noneSelected') }),
    ),
    h(
      'section',
      { class: 'gd-op-block' },
      h('h3', { text: t('summary.engagement') }),
      h('p', {}, h('strong', { text: `${t(`size.${size}.label`)} · ${t(`size.${size}.duration`)} · ${t(`size.${size}.model`)}` })),
      h('p', {}, h('strong', { text: `${t(`size.${size}.title`)}: ` }), t(`size.${size}.text`)),
      h('p', { class: 'gd-help', text: t('size.note') }),
    ),
    h(
      'section',
      { class: 'gd-op-block' },
      h('h3', { text: t('summary.nextSteps') }),
      h('ol', {}, [1, 2, 3].map((n) => h('li', {}, h('strong', { text: t(`step.${result.headline}.${n}.title`) }), h('span', { text: ` - ${t(`step.${result.headline}.${n}.text`)}` })))),
    ),
    h(
      'section',
      { class: 'gd-op-block' },
      h('h3', { text: t('summary.team') }),
      h('ul', {}, copy.list('contacts').map((c) => h('li', {}, h('strong', { text: c.name }), ` - ${c.role}`))),
    ),
    inventoryReview(ctx),
    h('details', { class: 'gd-answer-log' }, h('summary', { text: t('summary.answerLog') }), answerLog(ctx)),
    h('p', { class: 'gd-disclaimer', text: t('summary.disclaimer') }),
  );
}
