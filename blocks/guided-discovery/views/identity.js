/* Identity & Stitching (copy doc 5.8): explore the four stages, then pick Today and Target. */
import { h, chip } from '../lib/dom.js';
import { IDENTITY_STAGES } from '../lib/catalog.js';
import {
  header, footer, dropZone, draggable,
} from './common.js';

export default function renderIdentity(ctx) {
  const { copy, store } = ctx;
  const { t } = copy;
  const id = store.state.sections.identity;
  const set = (field, stage) => store.update('identity', (s) => { s[field] = s[field] === stage ? null : stage; });
  const name = (stage) => (stage ? copy.item('identity-stages', stage).name : null);

  return h(
    'section',
    { class: 'gd-identity' },
    header(ctx, { eyebrow: 'identity.eyebrow', heading: 'identity.heading' }),
    h('h3', { class: 'gd-subhead', text: t('identity.exploreHeading') }),
    h('ol', { class: 'gd-cards gd-stages' }, IDENTITY_STAGES.map((stage) => {
      const c = copy.item('identity-stages', stage);
      return h('li', {}, draggable(h(
        'article',
        { class: `gd-card${id.current === stage || id.target === stage ? ' is-on' : ''}` },
        h('h4', {}, c.name, c.short && h('span', { class: 'gd-help', text: ` (${c.short})` })),
        h('p', { text: c.enables }),
        h(
          'details',
          {},
          h('summary', { text: `${t('identity.prereqs')} / ${t('identity.blockers')}` }),
          c.prereqs && h('p', {}, h('strong', { text: `${t('identity.prereqs')}: ` }), c.prereqs),
          c.blockers && h('p', {}, h('strong', { text: `${t('identity.blockers')}: ` }), c.blockers),
        ),
        h(
          'div',
          { class: 'gd-chips' },
          chip(t('identity.setToday'), id.current === stage, () => set('current', stage)),
          chip(t('identity.setTarget'), id.target === stage, () => set('target', stage)),
        ),
      ), stage));
    })),
    h('h3', { class: 'gd-subhead', text: t('identity.placeHeading') }),
    h('p', { class: 'gd-help', text: t('identity.instructions') }),
    h('p', { class: 'gd-help', text: t('identity.rule') }),
    h(
      'div',
      { class: 'gd-zones' },
      dropZone(t('identity.today'), [name(id.current)].filter(Boolean), (stage) => store.update('identity', (s) => { s.current = stage; })),
      dropZone(t('identity.target'), [name(id.target)].filter(Boolean), (stage) => store.update('identity', (s) => { s.target = stage; })),
    ),
    footer(ctx, 'identity', { text: 'identity.footer' }),
  );
}
