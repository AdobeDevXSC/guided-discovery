import { h, rich } from '../lib/dom.js';
import { WORKFLOW } from '../lib/store.js';

/** Section header: optional eyebrow, heading, optional intro paragraph. */
export function header(ctx, { eyebrow, heading, intro }) {
  const { t } = ctx.copy;
  return h(
    'div',
    { class: 'gd-section-head' },
    eyebrow && h('p', { class: 'gd-eyebrow', text: t(eyebrow) }),
    h('h2', { tabindex: '-1', class: 'gd-focus-target', text: t(heading) }),
    intro && h('p', { class: 'gd-intro' }, rich(t(intro))),
  );
}

/** Footer with hint text, Back, Mark complete and Continue. */
export function footer(ctx, page, {
  text, canContinue = true, onBack, onContinue, markDone = true,
} = {}) {
  const { t } = ctx.copy;
  const { state } = ctx.store;
  const idx = WORKFLOW.indexOf(page);
  const done = state.progress.completed.includes(page);
  const next = () => {
    if (markDone) ctx.store.markComplete(page);
    if (onContinue) onContinue();
    else ctx.next(page);
  };
  return h(
    'div',
    { class: 'gd-section-foot' },
    text && h('p', { class: 'gd-hint', text: t(text) }),
    h(
      'div',
      { class: 'gd-actions' },
      (onBack || idx > 0) && h('button', {
        type: 'button', class: 'gd-btn gd-btn-ghost', onClick: onBack || (() => ctx.go(WORKFLOW[idx - 1])), text: t('section.back'),
      }),
      done && h('span', { class: 'gd-done-badge', text: t('section.completed') }),
      h('button', {
        type: 'button', class: 'gd-btn gd-btn-primary', disabled: !canContinue, onClick: next, text: t('section.continue'),
      }),
    ),
  );
}

/** Drop zone that accepts dragged cards carrying data-gd-id; buttons remain the primary path. */
export function dropZone(label, items, onDrop, { empty = '' } = {}) {
  const zone = h(
    'div',
    {
      class: 'gd-zone', role: 'group', 'aria-label': label,
    },
    h('p', { class: 'gd-zone-label', text: label }),
    items.length ? h('ul', { class: 'gd-zone-list' }, items.map((i) => h('li', {}, i))) : h('p', { class: 'gd-zone-empty', text: empty }),
  );
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-over');
    const id = e.dataTransfer.getData('text/plain');
    if (id) onDrop(id);
  });
  return zone;
}

/** Makes a card draggable for the drop zones. */
export function draggable(el, id) {
  el.setAttribute('draggable', 'true');
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  });
  return el;
}

export const toggleIn = (arr, id) => {
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(id);
};

/** Renders a prompt as chips (single or multi select) bound to answers[promptId] arrays. */
export function promptBlock(ctx, prompt, answers, onChange) {
  const { copy } = ctx;
  const picked = answers[prompt.id] || [];
  const q = copy.item('prompts', prompt.id).question;
  const selectedCaption = picked.length === 1 ? copy.option(prompt.id, picked[0]).caption : '';
  return h(
    'fieldset',
    { class: 'gd-prompt' },
    h('legend', { text: q }),
    h('div', { class: 'gd-chips', role: prompt.single ? 'radiogroup' : 'group' }, prompt.options.map((opt) => {
      const on = picked.includes(opt);
      return h('button', {
        type: 'button',
        class: `gd-chip${on ? ' is-on' : ''}`,
        role: prompt.single ? 'radio' : undefined,
        'aria-checked': prompt.single ? String(on) : undefined,
        'aria-pressed': prompt.single ? undefined : String(on),
        onClick: () => onChange((a) => {
          const cur = a[prompt.id] || [];
          let nextVals;
          if (prompt.single) nextVals = on ? [] : [opt];
          else nextVals = on ? cur.filter((x) => x !== opt) : [...cur, opt];
          if (nextVals.length) a[prompt.id] = nextVals;
          else delete a[prompt.id];
        }),
      }, copy.option(prompt.id, opt).label);
    })),
    selectedCaption && h('p', { class: 'gd-caption', text: selectedCaption }),
  );
}
