/*
 * The guided flow over the page (as in the live app): the first single-choice cards question as a
 * picker screen, swipe questions as a card stack (focus matches first, then an optional "outside
 * your focus" round), and every step group ("A few questions to start", ...) one question per
 * screen with Back / Next / Done. Answers go through the same store as the inline view.
 */
import { h } from '../guided-discovery/lib/dom.js';
import {
  control, cards, fmt, isSingle, mappingCard, perItemChoice,
} from './widgets.js';

/** Splits the section's questions into guided steps. */
export function buildSteps(section, focus) {
  const steps = [];
  let group = null;
  (section.questions || []).forEach((q, i) => {
    if (i === 0 && q.display === 'cards-single') {
      steps.push({ type: 'picker', q });
    } else if (q.display === 'swipe' || q.display === 'inventory') {
      group = null;
      steps.push({ type: 'swipe', q });
    } else if (q.display === 'per-item') {
      group = null;
      steps.push({ type: 'per-item', q });
    } else {
      if (!group || q.groupHeading) {
        group = { type: 'questions', title: q.groupHeading || section.heading, questions: [] };
        steps.push(group);
      }
      group.questions.push(q);
    }
  });
  // within a step, questions marked "ask first" for the chosen focus move to the front
  steps.filter((s) => s.type === 'questions').forEach((s) => {
    s.questions = [
      ...s.questions.filter((q) => focus && q.firstForFocus === focus),
      ...s.questions.filter((q) => !(focus && q.firstForFocus === focus)),
    ];
  });
  return steps;
}

const matchesFocus = (o, focus) => !focus || focus === 'both' || !o.bucket || o.bucket === focus || o.bucket === 'both';

/**
 * Opens the guided flow. api: { answers(), set(qid, ids), toggle(q, id), focusOf() }.
 * onDone runs when the last step finishes (not when the visitor closes the overlay).
 */
export default function openGuided(section, api, onDone) {
  const labels = section.labels || {};
  const previous = document.activeElement;
  const title = h('h3', { class: 'gd-ov-title', id: 'gd-ov-title' });
  const progress = h('p', { class: 'gd-ov-progress' });
  const body = h('div', { class: 'gd-ov-body' });
  const foot = h('div', { class: 'gd-ov-foot' });
  const box = h('div', {
    class: 'gd-ov-box', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gd-ov-title', tabindex: '-1',
  });
  const overlay = h('div', { class: 'gd-overlay' }, box);
  let stepIndex = 0;
  let steps = buildSteps(section, api.focusOf());
  let state = {}; // per-step cursor (question index, swipe position, interstitial)

  let onKey = null;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('gd-ov-open');
    if (previous && previous.focus) previous.focus();
  };
  const finish = () => { close(); if (onDone) onDone(); };
  const nextStep = () => {
    stepIndex += 1;
    // a different focus may reorder the remaining steps' questions
    steps = buildSteps(section, api.focusOf());
    state = {};
    if (stepIndex >= steps.length) finish();
    // eslint-disable-next-line no-use-before-define
    else render();
  };
  onKey = (e) => { if (e.key === 'Escape') close(); };

  const closeBtn = h('button', {
    type: 'button', class: 'gd-ov-close', 'aria-label': labels.close || 'Close', onClick: close, text: '×',
  });
  box.append(h('div', { class: 'gd-ov-head' }, h('div', {}, title, progress), closeBtn), body, foot);

  function renderPicker(step) {
    const { q } = step;
    title.textContent = q.title;
    progress.textContent = '';
    foot.hidden = true;
    body.replaceChildren(
      q.help ? h('p', { class: 'gd-ov-help', text: q.help }) : '',
      cards(q, q.options || [], api.answers()[q.id] || [], (id) => {
        api.set(q.id, [id]);
        nextStep();
      }),
    );
  }

  function renderSwipe(step) {
    const { q } = step;
    const focus = q.filterByQuestion ? api.answerFor(q.filterByQuestion)[0] : null;
    const all = q.options || [];
    if (!state.items) {
      const matched = all.filter((o) => matchesFocus(o, focus));
      state.items = matched.length ? matched : all;
      state.rest = matched.length ? all.filter((o) => !matchesFocus(o, focus)) : [];
      state.i = 0;
    }
    foot.hidden = false;
    const decide = (yes) => {
      if (state.interstitial) {
        if (yes) {
          state.items = state.rest;
          state.rest = [];
          state.i = 0;
          state.interstitial = false;
          renderSwipe(step);
        } else nextStep();
        return;
      }
      const item = state.items[state.i];
      const picked = api.answers()[q.id] || [];
      if (yes && !picked.includes(item.id)) api.toggle(q, item.id);
      if (!yes && picked.includes(item.id)) api.toggle(q, item.id);
      state.i += 1;
      if (state.i >= state.items.length) {
        if (state.rest.length) state.interstitial = true;
        else { nextStep(); return; }
      }
      renderSwipe(step);
    };
    foot.replaceChildren(h(
      'div',
      { class: 'gd-swipe-buttons' },
      h('button', {
        type: 'button', class: 'gd-swipe-no', 'aria-label': labels.no || 'No', onClick: () => decide(false), text: '✕',
      }),
      h('button', {
        type: 'button', class: 'gd-swipe-yes', 'aria-label': labels.yes || 'Yes', onClick: () => decide(true), text: '✓',
      }),
    ));
    if (state.interstitial) {
      title.textContent = q.outsideTitle || q.title;
      progress.textContent = fmt(labels.optionalCount, { n: state.rest.length });
      body.replaceChildren(
        h('p', { class: 'gd-ov-help gd-center', text: labels.swipeHint }),
        h('div', { class: 'gd-swipe-message', text: q.outsideMessage || '' }),
      );
      return;
    }
    title.textContent = q.guidedTitle || q.title;
    progress.textContent = fmt(labels.swipeCount, { n: state.i + 1, total: state.items.length });
    const item = state.items[state.i];
    const picked = (api.answers()[q.id] || []).includes(item.id);
    const card = h(
      'div',
      { class: 'gd-swipe-card' },
      (item.subLabel || item.tag) && h('span', { class: 'gd-swipe-tag', text: item.subLabel || item.tag }),
      h('strong', { class: 'gd-swipe-name', text: item.label }),
      item.description && h('span', { class: 'gd-swipe-desc', text: item.description }),
      picked && h('span', { class: 'gd-swipe-badge', text: '✓' }),
    );
    const next = state.items[state.i + 1];
    const stack = h(
      'div',
      { class: 'gd-swipe-stack' },
      next && h(
        'div',
        { class: 'gd-swipe-card gd-swipe-under' },
        (next.subLabel || next.tag) && h('span', { class: 'gd-swipe-tag', text: next.subLabel || next.tag }),
        h('strong', { class: 'gd-swipe-name', text: next.label }),
      ),
      card,
    );
    let startX = 0;
    let dx = 0;
    card.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      dx = 0;
      try { card.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      const move = (ev) => {
        dx = ev.clientX - startX;
        card.style.transform = `translateX(${dx}px) rotate(${(dx / 20).toFixed(1)}deg)`;
        card.classList.toggle('is-yes', dx > 40);
        card.classList.toggle('is-no', dx < -40);
      };
      const up = () => {
        card.removeEventListener('pointermove', move);
        card.removeEventListener('pointerup', up);
        card.removeEventListener('pointercancel', up);
        if (dx > 80) decide(true);
        else if (dx < -80) decide(false);
        else { card.style.transform = ''; card.classList.remove('is-yes', 'is-no'); }
      };
      card.addEventListener('pointermove', move);
      card.addEventListener('pointerup', up);
      card.addEventListener('pointercancel', up);
    });
    body.replaceChildren(h('p', { class: 'gd-ov-help gd-center', text: labels.swipeHint }), stack);
  }

  function renderQuestions(step) {
    if (state.qi === undefined) state.qi = 0;
    const q = step.questions[state.qi];
    const last = state.qi === step.questions.length - 1;
    title.textContent = step.title;
    const total = step.questions.length;
    progress.textContent = fmt(labels.questionCount, { n: state.qi + 1, total });
    foot.hidden = false;
    const picked = api.answers()[q.id] || [];
    const options = q.options || [];
    body.replaceChildren(
      h('p', { class: 'gd-ov-question', text: q.title }),
      q.help ? h('p', { class: 'gd-ov-help', text: q.help }) : '',
      control(q, options, picked, {
        toggle: (id) => { api.toggle(q, id); renderQuestions(step); },
        choose: (id) => { api.set(q.id, id ? [id] : []); renderQuestions(step); },
      }, labels),
    );
    foot.replaceChildren(
      state.qi > 0 ? h('button', {
        type: 'button', class: 'gd-btn-ghost', onClick: () => { state.qi -= 1; renderQuestions(step); }, text: labels.back || 'Back',
      }) : h('span'),
      h('button', {
        type: 'button',
        class: 'gd-btn-primary',
        onClick: () => {
          if (last) nextStep();
          else { state.qi += 1; renderQuestions(step); }
        },
        text: last ? (labels.done || 'Done') : (labels.next || 'Next'),
      }),
    );
  }

  // one item per screen: its mapping card and the per-item choices
  function renderPerItem(step) {
    const { q } = step;
    if (!state.items) {
      state.items = api.itemsOf(q);
      state.pi = 0;
    }
    if (!state.items.length) { nextStep(); return; }
    const item = state.items[state.pi];
    const last = state.pi === state.items.length - 1;
    title.textContent = q.guidedTitle || q.title;
    progress.textContent = fmt(labels.itemCount, { n: state.pi + 1, total: state.items.length });
    foot.hidden = false;
    const setItem = (itemId, choiceId) => {
      api.setItem(q)(itemId, choiceId);
      renderPerItem(step);
    };
    const current = perItemChoice(api.answers()[q.id], item.id);
    body.replaceChildren(mappingCard(q, item, current, setItem, labels));
    foot.replaceChildren(
      state.pi > 0 ? h('button', {
        type: 'button', class: 'gd-btn-ghost', onClick: () => { state.pi -= 1; renderPerItem(step); }, text: labels.back || 'Back',
      }) : h('span'),
      h('button', {
        type: 'button',
        class: 'gd-btn-primary',
        onClick: () => {
          if (last) nextStep();
          else { state.pi += 1; renderPerItem(step); }
        },
        text: last ? (labels.done || 'Done') : (labels.next || 'Next'),
      }),
    );
  }

  function render() {
    const step = steps[stepIndex];
    if (step.type === 'picker') renderPicker(step);
    else if (step.type === 'swipe') renderSwipe(step);
    else if (step.type === 'per-item') renderPerItem(step);
    else renderQuestions(step);
    box.focus({ preventScroll: true });
  }

  document.body.append(overlay);
  document.body.classList.add('gd-ov-open');
  document.addEventListener('keydown', onKey);
  // skip the picker when the focus is already answered (e.g. resuming)
  if (steps[0] && steps[0].type === 'picker' && (api.answers()[steps[0].q.id] || []).length) stepIndex = 1;
  if (stepIndex >= steps.length) { close(); return; }
  render();
}

export { isSingle };
