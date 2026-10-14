/* Governance & Access (copy doc 5.9): mark each control as a gap or already in place. */
import { h, chip } from '../lib/dom.js';
import { GOVERNANCE } from '../lib/catalog.js';
import {
  header, footer, dropZone, draggable,
} from './common.js';

export default function renderGovernance(ctx) {
  const { copy, store } = ctx;
  const { t } = copy;
  const { status } = store.state.sections.governance;
  const set = (control, value, toggle = true) => store.update('governance', (s) => {
    if (toggle && s.status[control] === value) delete s.status[control];
    else s.status[control] = value;
  });
  const names = (value) => GOVERNANCE.filter((g) => status[g] === value).map((g) => copy.item('governance', g).name);

  return h(
    'section',
    { class: 'gd-gov' },
    header(ctx, { eyebrow: 'gov.eyebrow', heading: 'gov.heading' }),
    h('h3', { class: 'gd-subhead', text: t('gov.learnHeading') }),
    h('div', { class: 'gd-cards gd-controls' }, GOVERNANCE.map((g) => {
      const c = copy.item('governance', g);
      return draggable(h(
        'article',
        { class: `gd-card${status[g] ? ' is-on' : ''}` },
        h('h4', { text: c.name }),
        h('p', { text: c.description }),
        c.example && h('p', { class: 'gd-help' }, h('strong', { text: `${t('gov.example')} ` }), c.example),
        h(
          'div',
          { class: 'gd-chips' },
          chip(t('gov.gap'), status[g] === 'gap', () => set(g, 'gap')),
          chip(t('gov.inPlace'), status[g] === 'in-place', () => set(g, 'in-place')),
        ),
      ), g);
    })),
    h('h3', { class: 'gd-subhead', text: t('gov.sortHeading') }),
    h('p', { class: 'gd-help', text: t('gov.instructions') }),
    h('p', { class: 'gd-help', text: t('gov.rule') }),
    h(
      'div',
      { class: 'gd-zones' },
      dropZone(t('gov.gap'), names('gap'), (g) => set(g, 'gap', false)),
      dropZone(t('gov.inPlace'), names('in-place'), (g) => set(g, 'in-place', false)),
    ),
    footer(ctx, 'governance', { text: 'gov.footer' }),
  );
}
