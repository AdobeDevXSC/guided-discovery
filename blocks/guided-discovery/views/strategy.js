/* Strategy & Adoption (copy doc 5.11): operating-model questions and AI-readiness picks. */
import { h } from '../lib/dom.js';
import { CAPABILITIES, PROMPTS } from '../lib/catalog.js';
import { header, footer, promptBlock } from './common.js';

export default function renderStrategy(ctx) {
  const { copy, store } = ctx;
  const { t } = copy;
  const s = store.state.sections.strategyAdoption;
  const update = (fn) => store.update('strategyAdoption', fn);

  return h(
    'section',
    { class: 'gd-strategy' },
    header(ctx, { heading: 'strategy.heading' }),
    PROMPTS.filter((p) => p.group === 'strategy').map((p) => promptBlock(ctx, p, s.answers, (fn) => update((x) => fn(x.answers)))),
    h('h3', { class: 'gd-subhead', text: t('strategy.aiHeading') }),
    h('p', { class: 'gd-help', text: t('strategy.aiText') }),
    h(
      'fieldset',
      { class: 'gd-block' },
      h('legend', { text: t('strategy.aiPrompt') }),
      h('div', { class: 'gd-cards gd-capabilities' }, CAPABILITIES.map((cap) => {
        const c = copy.item('capabilities', cap);
        const on = s.aiCapabilityPicks.includes(cap);
        return h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(on),
            class: `gd-card gd-select${on ? ' is-on' : ''}`,
            onClick: () => update((x) => {
              x.aiCapabilityPicks = on
                ? x.aiCapabilityPicks.filter((v) => v !== cap)
                : [...x.aiCapabilityPicks, cap];
            }),
          },
          h('strong', { text: c.name }),
          h('span', { text: c.description }),
        );
      })),
    ),
    footer(ctx, 'strategy-adoption', { text: 'strategy.footer', onContinue: () => ctx.finish() }),
  );
}
