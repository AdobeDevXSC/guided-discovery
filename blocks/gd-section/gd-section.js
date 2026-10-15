/*
 * gd-section: one Guided Discovery section rendered from DA structured content
 * (schema "guided-discovery-section", see tools/importer/guided-discovery/schemas/).
 *
 * Block config (2-column rows):
 *   Content  | link to the structured document, e.g. /forms/guided-discovery/discovery
 *   Endpoint | App Builder guided-discovery action URL (only needed on the first gd-section)
 *
 * Answers are saved as sections["sc-<sectionId>"] = { answers: { questionId: [optionId...] } }
 * through the page's shared session (./session.js).
 */
import { readBlockConfig } from '../../scripts/aem.js';
import { h } from '../guided-discovery/lib/dom.js';
import getSession, { contentEnv } from './session.js';

const SC_BASE = 'https://da-sc.adobeaem.workers.dev';
const DEFAULT_REPO = 'adobedevxsc/guided-discovery';

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

function optionButton(q, opt, on, toggle) {
  const single = /-single$/.test(q.display);
  const cards = /^cards-/.test(q.display);
  return h(
    'button',
    {
      type: 'button',
      class: cards ? `gd-sc-card${on ? ' is-on' : ''}` : `gd-sc-chip${on ? ' is-on' : ''}`,
      role: single ? 'radio' : undefined,
      'aria-checked': single ? String(on) : undefined,
      'aria-pressed': single ? undefined : String(on),
      onClick: toggle,
    },
    cards ? h('strong', { text: opt.label }) : opt.label,
    cards && opt.description ? h('span', { text: opt.description }) : null,
  );
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
  const key = `sc-${section.sectionId}`;
  const questions = Array.isArray(section.questions) ? section.questions : [];

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

  const toggle = (q, optId) => store.update(key, (sec) => {
    const cur = sec.answers[q.id] || [];
    const on = cur.includes(optId);
    let next;
    if (/-single$/.test(q.display)) next = on ? [] : [optId];
    else next = on ? cur.filter((x) => x !== optId) : [...cur, optId];
    if (next.length) sec.answers[q.id] = next;
    else delete sec.answers[q.id];
  });

  const orderedOptions = (q, answers) => {
    const opts = Array.isArray(q.options) ? q.options : [];
    if (!q.filterByQuestion) return opts;
    const focus = (answers[q.filterByQuestion] || [])[0];
    if (!focus || focus === 'both') return opts;
    const matches = (o) => !o.bucket || o.bucket === focus || o.bucket === 'both';
    return [...opts.filter(matches), ...opts.filter((o) => !matches(o))];
  };

  function render() {
    const answers = answersOf();
    const missing = questions.filter((q) => q.required && !(answers[q.id] || []).length);
    const done = store.state.progress.completed.includes(section.sectionId);
    const next = () => {
      store.markComplete(section.sectionId);
      // scroll to the next section on the long page, if any
      const sections = [...document.querySelectorAll('.gd-sc')];
      const after = sections[sections.indexOf(root) + 1];
      if (after) after.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    // replaceChildren does not flatten arrays or skip falsy values the way h() does
    const children = [
      section.eyebrow && h('p', { class: 'gd-sc-eyebrow', text: section.eyebrow }),
      h('h2', { id: `gd-${section.sectionId}-h`, text: section.heading }),
      section.intro && h('p', { class: 'gd-sc-intro', text: section.intro }),
      questions.map((q) => {
        const picked = answers[q.id] || [];
        const caption = picked.length === 1 ? ((q.options || []).find((o) => o.id === picked[0]) || {}).caption : '';
        return [
          q.groupHeading && h('h3', { class: 'gd-sc-group', text: q.groupHeading }),
          h(
            'fieldset',
            { class: `gd-sc-q gd-sc-${q.display}` },
            h('legend', {}, q.title, q.required ? h('span', { class: 'gd-sc-req', 'aria-hidden': 'true', text: ' *' }) : null),
            q.help && h('p', { class: 'gd-sc-help', text: q.help }),
            h(
              'div',
              {
                class: /^cards-/.test(q.display) ? 'gd-sc-cards' : 'gd-sc-chips',
                role: /-single$/.test(q.display) ? 'radiogroup' : 'group',
              },
              orderedOptions(q, answers)
                .map((o) => optionButton(q, o, picked.includes(o.id), () => toggle(q, o.id))),
            ),
            caption && h('p', { class: 'gd-sc-caption', text: caption }),
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
            type: 'button', class: 'gd-sc-btn', disabled: missing.length > 0, onClick: next, text: section.continueLabel || 'Continue',
          }),
        ),
      ),
    ];
    root.replaceChildren(...children.flat(Infinity).filter(Boolean));
  }

  store.subscribe((kind, detail = {}) => {
    if ((kind === 'section' && detail.key === key) || kind === 'progress' || kind === 'result') render();
  });
  status.remove();
  block.append(root);
  render();
}
