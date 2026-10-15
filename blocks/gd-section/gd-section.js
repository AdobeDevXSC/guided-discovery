/*
 * gd-section: one Guided Discovery section rendered from DA structured content
 * (schema "guided-discovery-section", see tools/importer/guided-discovery/schemas/).
 *
 * Block config (2-column rows):
 *   Content  | link to the structured document, e.g. /forms/guided-discovery/discovery
 *   Endpoint | App Builder guided-discovery action URL (only needed on the first gd-section)
 *
 * As in the live app, the section is fully answerable inline, and a Start card launches the guided
 * flow over the page (picker, swipe cards, one question per screen, sliders). Answers are saved as
 * sections["sc-<sectionId>"] = { answers: { questionId: [optionId...] } } through the page's
 * shared session (./session.js).
 */
import { readBlockConfig } from '../../scripts/aem.js';
import { h } from '../guided-discovery/lib/dom.js';
import getSession from './session.js';
import loadStructured from './content.js';
import { control, isSingle } from './widgets.js';
import openGuided from './guided.js';

const DEFAULT_LABELS = {
  startHeading: 'Ready when you are',
  start: 'Start ->',
  resume: 'Continue ->',
  next: 'Next ->',
  back: '<- Back',
  done: 'Done',
  questionCount: 'Question {n} of {total}',
  selectOne: 'Select one',
  selectAll: 'Select all that apply',
  swipeHint: 'Swipe left (or tap ✕) for no - right (or tap ✓) for yes.',
  swipeCount: '{n} of {total}',
  optionalCount: '{n} more, optional',
  sliderHint: 'Drag to answer, or tap a point on the line',
  yes: 'Yes',
  no: 'No',
  close: 'Close',
};

const first = (v) => (Array.isArray(v) ? v[0] : v);

export default async function decorate(block) {
  const cfg = readBlockConfig(block);
  const contentLink = first(cfg.content);
  const endpoint = first(cfg.endpoint);
  block.textContent = '';
  const status = h('p', { class: 'gd-sc-status', role: 'status', 'aria-live': 'polite' });
  block.append(status);
  if (!contentLink) {
    status.textContent = 'This section is missing its Content link.';
    return;
  }

  let section;
  try {
    section = await loadStructured(contentLink);
  } catch (e) {
    status.textContent = 'This section could not be loaded. Please reload the page.';
    return;
  }
  section.labels = { ...DEFAULT_LABELS, ...(section.labels || {}) };
  const { labels } = section;
  const key = `sc-${section.sectionId}`;
  const questions = Array.isArray(section.questions) ? section.questions : [];
  const focusQuestion = questions.find((q) => q.display === 'cards-single');

  const shared = getSession(endpoint);
  if (!shared) {
    status.textContent = 'The first Guided Discovery section on the page needs an Endpoint row.';
    return;
  }
  await shared.ready;
  const { store } = shared;
  const answersOf = () => ((store.state.sections[key] || {}).answers || {});

  const root = h('section', { class: 'gd-sc', id: `gd-${section.sectionId}`, 'aria-labelledby': `gd-${section.sectionId}-h` });
  const save = h('span', { class: 'gd-sc-save', role: 'status', 'aria-live': 'polite' });
  shared.onStatus((s) => {
    save.dataset.state = s;
    save.textContent = {
      saving: 'Saving…', saved: 'All changes saved', offline: 'Offline - will save when reconnected', error: 'Some changes could not be saved',
    }[s] || '';
  });

  const setAnswer = (qid, ids) => store.update(key, (sec) => {
    if (ids.length) sec.answers[qid] = ids;
    else delete sec.answers[qid];
  });
  const toggle = (q, optId) => {
    const cur = answersOf()[q.id] || [];
    const on = cur.includes(optId);
    // un-picking an item also clears what per-item questions recorded about it
    const dropItem = (id) => questions.filter((x) => x.display === 'per-item' && x.itemsFrom === q.id)
      .forEach((x) => {
        const rest = (answersOf()[x.id] || []).filter((v) => !v.startsWith(`${id}:`));
        if (rest.length !== (answersOf()[x.id] || []).length) setAnswer(x.id, rest);
      });
    if (isSingle(q)) {
      if (cur[0] && cur[0] !== optId) dropItem(cur[0]);
      if (on) dropItem(optId);
      setAnswer(q.id, on ? [] : [optId]);
    } else {
      if (on) dropItem(optId);
      setAnswer(q.id, on ? cur.filter((x) => x !== optId) : [...cur, optId]);
    }
  };
  const focusOf = () => (focusQuestion ? (answersOf()[focusQuestion.id] || [])[0] : null);

  // "questionId" in this section, or "sectionId.questionId" in another section on the page
  const refKey = (ref) => (ref && ref.includes('.') ? `sc-${ref.split('.')[0]}` : key);
  const answerFor = (ref) => {
    if (!ref) return [];
    const qid = ref.includes('.') ? ref.split('.')[1] : ref;
    return (((store.state.sections[refKey(ref)] || {}).answers || {})[qid]) || [];
  };
  // sections this one reads from (re-render when they change)
  const dependsOn = new Set([...questions.map((q) => q.filterByQuestion), section.focusFrom]
    .filter(Boolean).map(refKey));
  // the focus that orders questions and options: the section's focusFrom, else its own picker
  const sectionFocus = () => (section.focusFrom ? answerFor(section.focusFrom)[0] : focusOf());
  const matchesFocus = (bucket, focus) => !!focus && focus !== 'both'
    && (bucket === focus || bucket === 'both');
  // asked first: questions marked for this focus, or whose bucket matches it
  const askFirst = (q, focus) => (focus && q.firstForFocus === focus)
    || matchesFocus(q.bucket, focus);

  // owner cards: "optionId=Name" (saved without re-rendering so typing keeps focus) and
  // "optionId:follow-up"
  const owners = (q) => ({
    setOwner: (optId, text) => store.update(key, (sec) => {
      const rest = (sec.answers[q.id] || []).filter((v) => !v.startsWith(`${optId}=`));
      const clean = text.replace(/\s+/g, ' ').trim().slice(0, 120);
      const next = clean ? [...rest, `${optId}=${clean}`] : rest;
      if (next.length) sec.answers[q.id] = next;
      else delete sec.answers[q.id];
    }, { render: false }),
    toggleFollowUp: (optId) => {
      const cur = answersOf()[q.id] || [];
      const flag = `${optId}:follow-up`;
      setAnswer(q.id, cur.includes(flag) ? cur.filter((v) => v !== flag) : [...cur, flag]);
    },
  });
  // sliders with differentFrom: picking the other question's stop clears that question
  const chooseFor = (q) => (id) => {
    const other = q.differentFrom && (answersOf()[q.differentFrom] || [])[0];
    if (id && other === id) setAnswer(q.differentFrom, []);
    setAnswer(q.id, id ? [id] : []);
  };

  // per-item answers are "itemId:choiceId", one per item
  const setItem = (q) => (itemId, choiceId) => {
    const rest = (answersOf()[q.id] || []).filter((v) => !v.startsWith(`${itemId}:`));
    setAnswer(q.id, choiceId ? [...rest, `${itemId}:${choiceId}`] : rest);
  };
  const itemsOf = (q) => {
    const source = questions.find((x) => x.id === q.itemsFrom);
    if (!source) return [];
    const picked = answersOf()[source.id] || [];
    return (source.options || []).filter((o) => picked.includes(o.id));
  };
  const ui = {}; // inventory search / filters, kept across re-renders

  const orderedOptions = (q) => {
    const opts = Array.isArray(q.options) ? q.options : [];
    if (!q.filterByQuestion) return opts;
    const focus = answerFor(q.filterByQuestion)[0];
    if (!focus || focus === 'both') return opts;
    const matches = (o) => !o.bucket || o.bucket === focus || o.bucket === 'both';
    return [...opts.filter(matches), ...opts.filter((o) => !matches(o))];
  };

  const startGuided = () => openGuided(section, {
    answers: answersOf,
    set: setAnswer,
    toggle,
    focusOf: sectionFocus,
    answerFor,
    setItem,
    itemsOf,
    owners,
    chooseFor,
    askFirst,
    matchesFocus,
  }, () => {
    const f = root.querySelector('.gd-sc-foot');
    if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  function render() {
    const answers = answersOf();
    const anyAnswered = Object.keys(answers).length > 0;
    const missing = questions.filter((q) => q.required && !(answers[q.id] || []).length);
    const done = store.state.progress.completed.includes(section.sectionId);
    const focus = sectionFocus();
    // the inline page shows the same focus-first order the guided flow asks in
    const groups = [];
    questions.forEach((q) => {
      if (q.groupHeading || !groups.length) groups.push([]);
      groups[groups.length - 1].push(q);
    });
    // each group keeps its heading on whichever question focus ordering puts first
    const ordered = groups.flatMap((g) => [
      ...g.filter((q) => askFirst(q, focus)),
      ...g.filter((q) => !askFirst(q, focus)),
    ].map((q, j) => ({ q, heading: j === 0 ? g[0].groupHeading : null })));
    const next = () => {
      store.markComplete(section.sectionId);
      const sections = [...document.querySelectorAll('.gd-sc')];
      const after = sections[sections.indexOf(root) + 1];
      if (after) after.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    // replaceChildren does not flatten arrays or skip falsy values the way h() does
    const children = [
      section.eyebrow && h('p', { class: 'gd-sc-eyebrow', text: section.eyebrow }),
      h('h2', { id: `gd-${section.sectionId}-h`, text: section.heading }),
      section.intro && h('p', { class: 'gd-sc-intro', text: section.intro }),
      h(
        'div',
        { class: 'gd-start' },
        h('p', { class: 'gd-start-heading', text: labels.startHeading }),
        h('button', {
          type: 'button', class: 'gd-btn-primary', onClick: startGuided, text: anyAnswered ? labels.resume : labels.start,
        }),
      ),
      ordered.map(({ q, heading }) => {
        const picked = answers[q.id] || [];
        return [
          heading && h('h3', { class: 'gd-sc-group', text: heading }),
          h(
            'fieldset',
            { class: `gd-sc-q gd-sc-${q.display}` },
            // per-item cards repeat the question on every card, so its legend is for screen readers
            h('legend', { class: q.display === 'per-item' ? 'gd-sr' : undefined }, q.title, q.required ? h('span', { class: 'gd-sc-req', 'aria-hidden': 'true', text: ' *' }) : null),
            q.help && h('p', { class: 'gd-sc-help', text: q.help }),
            control(q, orderedOptions(q), picked, {
              toggle: (id) => toggle(q, id),
              choose: chooseFor(q),
            }, labels, {
              ui,
              items: itemsOf(q),
              setItem: setItem(q),
              owners: owners(q),
              isRelevant: (o) => matchesFocus(o.bucket, focus),
            }),
          ),
        ];
      }),
      h(
        'div',
        { class: 'gd-sc-foot' },
        missing.length && section.hint ? h('p', { class: 'gd-sc-hint', text: section.hint }) : null,
        section.continueText && h('p', { class: 'gd-sc-help', text: section.continueText }),
        h(
          'div',
          { class: 'gd-sc-actions' },
          save,
          done && h('span', { class: 'gd-sc-done', text: section.completedLabel || 'Section complete' }),
          h('button', {
            type: 'button', class: 'gd-btn-primary', disabled: missing.length > 0, onClick: next, text: section.continueLabel || 'Continue',
          }),
        ),
      ),
    ];
    root.replaceChildren(...children.flat(Infinity).filter(Boolean));
  }

  store.subscribe((kind, detail = {}) => {
    // quiet updates (owner text) save without re-rendering so the input keeps focus
    const mine = kind === 'section' && detail.render !== false
      && (detail.key === key || dependsOn.has(detail.key));
    if (mine || kind === 'progress' || kind === 'result') render();
  });
  status.remove();
  block.append(root);
  render();
}
