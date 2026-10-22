/*
 * gd-summary: the Guided Discovery summary and recommendation, from DA structured content
 * (schema "guided-discovery-summary", see tools/importer/guided-discovery/schemas/).
 *
 * Block config (2-column rows):
 *   Content  | link to the summary document, e.g. /forms/guided-discovery/summary
 *   Endpoint | App Builder guided-discovery action URL (only if no gd-section above sets it)
 *
 * The section documents it scores against are read from the same folder (summary.sections).
 * The recommendation updates live as answers change; Submit runs the same scoring on the server
 * (blocks/gd-summary/scoring.js), which stores the result with the session and keeps it current
 * if answers change afterwards.
 */
import { readBlockConfig } from '../../scripts/aem.js';
import h from '../gd-section/lib/dom.js';
import getSession from '../gd-section/session.js';
import loadStructured, { contentPath } from '../gd-section/content.js';
import { fmt } from '../gd-section/widgets.js';
import { answersFor, computeSummary } from './scoring.js';

const first = (v) => (Array.isArray(v) ? v[0] : v);
const list = (v) => (Array.isArray(v) ? v : []);

const DEFAULT_LABELS = {
  submit: 'Submit and see my summary',
  submitting: 'Submitting...',
  download: 'Download PDF',
  snapshotHeading: 'Your Discovery Snapshot',
  unlocksHeading: 'What This Unlocks For You',
  engagementHeading: 'Suggested Engagement',
  nextStepsHeading: 'Recommended Next Steps',
  teamHeading: 'Your Adobe Team',
  reason: 'You picked "{option}" in {section}.',
  reasonChoice: '"{option}" is marked "{choice}" in {section}.',
  reasonUpgrade: 'Your {section} target ("{option}") is further along than where you are today.',
  readiness: '{pct}% of the Data Foundations inventory reviewed',
  thanksHeading: "Thanks, that's submitted",
  thanksText: '',
  empty: 'Nothing captured yet - work through the sections above, and they will show up here.',
  notSet: 'Not set',
  error: 'That did not go through. Please try again in a moment.',
};

/** Label lookups over the section documents. */
function labeller(docs) {
  const question = (sectionId, qid) => list((docs[sectionId] || {}).questions)
    .find((q) => q.id === qid);
  const option = (q, id) => list(q && q.options).find((o) => o.id === id);
  return {
    section: (id) => (docs[id] || {}).eyebrow || id,
    question,
    option: (sectionId, qid, id) => (option(question(sectionId, qid), id) || {}).label || id,
    choice: (sectionId, qid, id) => (list((question(sectionId, qid) || {}).choices)
      .find((c) => c.id === id) || {}).label || id,
  };
}

function snapshotValue(row, docs, sections, labels, names) {
  const [sectionId, qid] = row.source.split('.');
  const answers = qid ? answersFor(sections, row.source) : [];
  const q = qid ? names.question(sectionId, qid) : null;
  const total = list(q && q.options).length;
  switch (row.show) {
    case 'answer':
      return answers.length ? answers.map((id) => names.option(sectionId, qid, id)).join(', ') : labels.notSet;
    case 'count':
      return fmt(row.template || '{n} of {total}', { n: answers.length, total });
    case 'choice-count': {
      const n = answers.filter((a) => a.endsWith(`:${row.choice}`)).length;
      return answers.length ? fmt(row.template || '{n}', { n, total }) : labels.notSet;
    }
    case 'owner-count': {
      const n = answers.filter((a) => a.includes('=')).length;
      return fmt(row.template || '{n} of {total}', { n, total });
    }
    case 'answered-count': {
      const questions = list((docs[sectionId] || {}).questions);
      const given = ((sections[sectionId] || {}).answers) || {};
      const n = questions.filter((x) => list(given[x.id]).length).length;
      return fmt(row.template || '{n} of {total}', { n, total: questions.length });
    }
    default:
      return labels.notSet;
  }
}

function reasonText(reason, labels, names) {
  const vars = {
    section: names.section(reason.section),
    option: names.option(reason.section, reason.question, reason.option),
    choice: reason.choice ? names.choice(reason.section, reason.question, reason.choice) : '',
  };
  if (reason.upgrade) return fmt(labels.reasonUpgrade, vars);
  return fmt(reason.choice ? labels.reasonChoice : labels.reason, vars);
}

export default async function decorate(block) {
  const cfg = readBlockConfig(block);
  const contentLink = first(cfg.content);
  block.textContent = '';
  const status = h('p', { class: 'gd-sum-status', role: 'status', 'aria-live': 'polite' });
  block.append(status);
  if (!contentLink) {
    status.textContent = 'The summary is missing its Content link.';
    return;
  }

  let summary;
  let docs;
  try {
    summary = await loadStructured(contentLink);
    const folder = contentPath(contentLink).replace(/\/[^/]+$/, '');
    const ids = list(summary.sections);
    const loaded = await Promise.all(ids.map((id) => loadStructured(`${folder}/${id}`).catch(() => ({}))));
    docs = Object.fromEntries(ids.map((id, i) => [id, loaded[i]]));
  } catch (e) {
    status.textContent = 'The summary could not be loaded. Please reload the page.';
    return;
  }
  const labels = { ...DEFAULT_LABELS, ...(summary.labels || {}) };
  const names = labeller(docs);

  const shared = getSession(first(cfg.endpoint));
  if (!shared) {
    status.textContent = 'The summary needs an Endpoint row when no Guided Discovery section is above it.';
    return;
  }
  await shared.ready;
  const { store, api } = shared;
  let submitting = false;
  let failed = false;

  const root = h('section', { class: 'gd-sc gd-sum', id: 'gd-summary', 'aria-labelledby': 'gd-summary-h' });

  const submit = async () => {
    submitting = true;
    failed = false;
    render(); // eslint-disable-line no-use-before-define
    try {
      const res = await api.complete();
      store.setResult(res.result);
    } catch (e) {
      failed = true;
    }
    submitting = false;
    render(); // eslint-disable-line no-use-before-define
  };

  function render() {
    const { sections } = store.state;
    const completed = store.state.status === 'completed';
    // same scoring as the server, so this stays in step with the stored result after edits too
    const result = computeSummary(summary, docs, sections);
    const answered = list(summary.sections)
      .some((id) => Object.keys((sections[id] || {}).answers || {}).length);
    const headline = list(summary.headlines).find((x) => x.id === result.headline) || {};
    const size = list(summary.sizes).find((x) => x.id === result.engagement) || {};
    const caps = Object.fromEntries(list(summary.capabilities).map((c) => [c.id, c]));
    const pct = Math.round(result.readinessPct * 100);

    const children = [
      h('h2', { id: 'gd-summary-h', text: summary.heading }),
      summary.intro && h('p', { class: 'gd-sc-intro', text: summary.intro }),
      !answered && h('p', { class: 'gd-sum-empty', text: labels.empty }),
      h(
        'div',
        { class: 'gd-sum-hero' },
        h('p', { class: 'gd-sum-headline', text: headline.label || '' }),
        h('div', {
          class: 'gd-sum-meter', role: 'img', 'aria-label': fmt(labels.readiness, { pct }),
        }, h('span', { style: `width:${pct}%` })),
        h('p', { class: 'gd-sum-readiness', text: fmt(labels.readiness, { pct }) }),
      ),
      list(summary.snapshot).length && h(
        'div',
        { class: 'gd-sum-block' },
        h('h3', { text: labels.snapshotHeading }),
        h('dl', { class: 'gd-sum-snapshot' }, list(summary.snapshot).map((row) => [
          h('dt', { text: row.label }),
          h('dd', { text: snapshotValue(row, docs, sections, labels, names) }),
        ])),
      ),
      result.matchedCapabilities.length > 0 && h(
        'div',
        { class: 'gd-sum-block' },
        h('h3', { text: labels.unlocksHeading }),
        h('ul', { class: 'gd-sum-caps' }, result.matchedCapabilities.map((m) => {
          const c = caps[m.id] || { label: m.id };
          return h(
            'li',
            { class: 'gd-sum-cap' },
            h('strong', { text: c.label }),
            c.description && h('p', { text: c.description }),
            h('ul', { class: 'gd-sum-reasons' }, list(m.reasons).map((r) => h('li', { text: reasonText(r, labels, names) }))),
          );
        })),
      ),
      size.id && h(
        'div',
        { class: 'gd-sum-block' },
        h('h3', { text: labels.engagementHeading }),
        h(
          'div',
          { class: 'gd-sum-size' },
          h('p', { class: 'gd-sum-size-meta' }, h('span', { class: 'gd-sum-pill', text: size.label }), [size.duration, size.model].filter(Boolean).join(' · ')),
          size.title && h('p', { class: 'gd-sum-size-title', text: size.title }),
          size.text && h('p', { text: size.text }),
        ),
        summary.sizeNote && h('p', { class: 'gd-sum-note', text: summary.sizeNote }),
      ),
      list(headline.steps).length && h(
        'div',
        { class: 'gd-sum-block' },
        h('h3', { text: labels.nextStepsHeading }),
        h('ol', { class: 'gd-sum-steps' }, headline.steps.map((s) => h('li', {}, h('strong', { text: s.title }), s.text && h('p', { text: s.text })))),
      ),
      list(summary.contacts).length && h(
        'div',
        { class: 'gd-sum-block' },
        h('h3', { text: labels.teamHeading }),
        h('ul', { class: 'gd-sum-team' }, summary.contacts.map((c) => h('li', {}, h('strong', { text: c.name }), c.role && h('span', { text: c.role })))),
      ),
      completed ? h(
        'div',
        { class: 'gd-sum-thanks', role: 'status' },
        h('h3', { text: labels.thanksHeading }),
        labels.thanksText && h('p', { text: labels.thanksText }),
        list(summary.links).length && h('ul', { class: 'gd-sum-links' }, summary.links.map((l) => h('li', {}, l.url
          ? h('a', {
            href: l.url, target: '_blank', rel: 'noopener noreferrer', text: l.label,
          })
          : h('span', { text: l.label })))),
      ) : null,
      h(
        'div',
        { class: 'gd-sum-actions' },
        failed && h('p', { class: 'gd-sum-error', role: 'alert', text: labels.error }),
        !completed && h('button', {
          type: 'button', class: 'gd-btn-primary', disabled: submitting || !answered, onClick: submit, text: submitting ? labels.submitting : labels.submit,
        }),
        h('button', {
          type: 'button', class: 'gd-btn-ghost', onClick: () => window.print(), text: labels.download,
        }),
      ),
      summary.disclaimer && h('p', { class: 'gd-sum-disclaimer', text: summary.disclaimer }),
    ];
    root.replaceChildren(...children.flat(Infinity).filter(Boolean));
  }

  let timer;
  store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });
  status.remove();
  block.append(root);
  render();
}
