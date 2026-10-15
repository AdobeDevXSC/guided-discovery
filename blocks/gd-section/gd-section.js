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
import getSession, { contentEnv } from './session.js';
import { control, isSingle } from './widgets.js';
import openGuided from './guided.js';

const SC_BASE = 'https://da-sc.adobeaem.workers.dev';
const DEFAULT_REPO = 'adobedevxsc/guided-discovery';
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

/** org/site from an EDS host (<ref>--<site>--<org>.aem.page|live); a fixed fallback elsewhere. */
function repoPath() {
  const m = window.location.hostname.match(/^[^.]+?--([a-z0-9-]+)--([a-z0-9-]+)\.aem\.(page|live)$/i);
  return m ? `${m[2]}/${m[1]}`.toLowerCase() : DEFAULT_REPO;
}

async function loadSection(contentLink) {
  const path = new URL(contentLink, window.location.href).pathname.replace(/\.(json|html)$/, '');
  const res = await fetch(`${SC_BASE}/${contentEnv()}/${repoPath()}${path}`);
  if (!res.ok) throw new Error(`structured content ${path} returned ${res.status}`);
  const json = await res.json();
  return json.data || json;
}

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
    section = await loadSection(contentLink);
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
  const dependsOn = new Set(questions.map((q) => q.filterByQuestion).filter(Boolean).map(refKey));

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
    answers: answersOf, set: setAnswer, toggle, focusOf, answerFor, setItem, itemsOf,
  }, () => {
    const f = root.querySelector('.gd-sc-foot');
    if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  function render() {
    const answers = answersOf();
    const anyAnswered = Object.keys(answers).length > 0;
    const missing = questions.filter((q) => q.required && !(answers[q.id] || []).length);
    const done = store.state.progress.completed.includes(section.sectionId);
    const focus = focusOf();
    // the inline page shows the same focus-first order the guided flow asks in
    const groups = [];
    questions.forEach((q) => {
      if (q.groupHeading || !groups.length) groups.push([]);
      groups[groups.length - 1].push(q);
    });
    // each group keeps its heading on whichever question focus ordering puts first
    const ordered = groups.flatMap((g) => [
      ...g.filter((q) => focus && q.firstForFocus === focus),
      ...g.filter((q) => !(focus && q.firstForFocus === focus)),
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
              choose: (id) => setAnswer(q.id, id ? [id] : []),
            }, labels, { ui, items: itemsOf(q), setItem: setItem(q) }),
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
    const mine = kind === 'section' && (detail.key === key || dependsOn.has(detail.key));
    if (mine || kind === 'progress' || kind === 'result') render();
  });
  status.remove();
  block.append(root);
  render();
}
