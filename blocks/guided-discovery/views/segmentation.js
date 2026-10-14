/* Segmentation Rebuild (copy doc 5.7): flag the AA segment patterns worth rebuilding. */
import { h, chip } from '../lib/dom.js';
import { SEGMENTS } from '../lib/catalog.js';
import {
  header, footer, dropZone, draggable, toggleIn,
} from './common.js';

export default function renderSegmentation(ctx) {
  const { copy, store } = ctx;
  const { t } = copy;
  const seg = store.state.sections.segmentation;
  const update = (fn) => store.update('segmentation', fn);
  const flag = (id) => update((s) => { if (!s.prioritized.includes(id)) s.prioritized.push(id); });

  return h(
    'section',
    { class: 'gd-seg' },
    header(ctx, { heading: 'seg.heading' }),
    h('h3', { class: 'gd-subhead', text: t('seg.flagHeading') }),
    h('p', { class: 'gd-help', text: t('seg.instructions') }),
    h('div', { class: 'gd-cards gd-patterns' }, SEGMENTS.map(({ id }) => {
      const c = copy.item('segments', id);
      const on = seg.prioritized.includes(id);
      return draggable(h(
        'article',
        { class: `gd-card${on ? ' is-on' : ''}` },
        h('h4', { text: c.name }),
        h('p', { text: c.description }),
        h('details', {}, h('summary', { text: t('seg.cjaLogic') }), h('p', { text: c.cjaLogic }), c.aaLogic && h('p', { class: 'gd-help' }, h('strong', { text: `${t('seg.aaLogic')} ` }), c.aaLogic)),
        chip(on ? t('seg.unflag') : t('seg.flag'), on, () => update((s) => toggleIn(s.prioritized, id))),
      ), id);
    })),
    dropZone(t('seg.zone'), seg.prioritized.map((id) => copy.item('segments', id).name), flag),
    footer(ctx, 'segmentation', { text: 'seg.footer' }),
  );
}
