import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchQuestions, saveQuestion } from './api';

// The question bank for one assessment: full question text and keys, editable, plus "Add question".
// Keys are fixed once saved and saved options can be relabelled but not removed, so stored answers
// keep their meaning (the API enforces the same rules).

const TYPE_OF_DISPLAY = {
  'cards-single': 'Single choice',
  'chips-single': 'Single choice',
  slider: 'Single choice (slider)',
  'cards-multi': 'Multiple choice',
  'chips-multi': 'Multiple choice',
  swipe: 'Multiple choice (swipe)',
  inventory: 'Multiple choice (inventory)',
  text: 'Free text',
  sort: 'Choice per option',
  'per-item': 'Choice per item',
  'owner-cards': 'Owner per option',
};
const NEW_TYPES = [['single', 'Single choice'], ['multiple', 'Multiple choice'], ['text', 'Free text']];
const SPECIAL = ['sort', 'per-item', 'owner-cards', 'inventory', 'swipe', 'slider'];
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const slug = (v) => String(v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  .slice(0, 64);

const typeLabel = (q) => TYPE_OF_DISPLAY[q.display] || q.display;
const blank = (section) => ({
  isNew: true,
  questionId: '',
  section: section || '',
  newSection: false,
  sectionTitle: '',
  title: '',
  help: '',
  type: 'single',
  required: false,
  options: [{ key: '', label: '', isNew: true }],
});
const toDraft = (q) => ({
  isNew: false,
  questionId: q.questionId,
  section: q.section,
  sectionTitle: q.sectionTitle,
  display: q.display,
  title: q.title || '',
  help: q.help || '',
  required: Boolean(q.required),
  options: (q.options || []).map((o) => ({ key: o.id, label: o.label || '', isNew: false })),
});

function FieldError({ errors, name }) {
  const msg = errors && errors[name];
  return msg ? <span className="field-error" role="alert">{msg}</span> : null;
}

function Editor({
  draft, setDraft, sections, onSave, onClose, saving, errors, message,
}) {
  const isText = draft.isNew ? draft.type === 'text' : draft.display === 'text';
  const noOptions = !draft.isNew && draft.display === 'per-item';
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setOption = (i, patch) => setDraft((d) => ({
    ...d, options: d.options.map((o, j) => (j === i ? { ...o, ...patch } : o)),
  }));
  const optionErrors = Object.keys(errors || {}).filter((k) => k.startsWith('options'));

  return (
    <aside className="detail question-editor" aria-label={draft.isNew ? 'New question' : 'Edit question'}>
      <div className="detail-head">
        <h2>{draft.isNew ? 'New question' : 'Edit question'}</h2>
        <button type="button" className="ghost" onClick={onClose}>Close</button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        {draft.isNew ? (
          <>
            <label className="field">
              Section
              <select
                value={draft.newSection ? '__new' : draft.section}
                onChange={(e) => (e.target.value === '__new'
                  ? set({ newSection: true, section: '', sectionTitle: '' })
                  : set({ newSection: false, section: e.target.value }))}
              >
                <option value="" disabled>Choose a section</option>
                {sections.map((s) => <option key={s.key} value={s.key}>{s.title} ({s.key})</option>)}
                <option value="__new">New section…</option>
              </select>
              <FieldError errors={errors} name="section" />
            </label>
            {draft.newSection && (
              <div className="field-row">
                <label className="field">
                  Section title
                  <input value={draft.sectionTitle} onChange={(e) => set({ sectionTitle: e.target.value, section: draft.sectionKeyTouched ? draft.section : slug(e.target.value) })} />
                  <FieldError errors={errors} name="sectionTitle" />
                </label>
                <label className="field">
                  Section key
                  <input value={draft.section} onChange={(e) => set({ section: e.target.value, sectionKeyTouched: true })} />
                </label>
              </div>
            )}
          </>
        ) : (
          <p className="muted">
            Section: <strong>{draft.sectionTitle}</strong> <code>{draft.section}</code> · {TYPE_OF_DISPLAY[draft.display] || draft.display}
          </p>
        )}

        <label className="field">
          Question
          <textarea rows={3} value={draft.title} onChange={(e) => set({ title: e.target.value, questionId: draft.isNew && !draft.keyTouched ? slug(e.target.value).slice(0, 40) : draft.questionId })} />
          <FieldError errors={errors} name="title" />
        </label>

        <label className="field">
          Key
          {draft.isNew ? (
            <input value={draft.questionId} onChange={(e) => set({ questionId: e.target.value, keyTouched: true })} aria-describedby="key-hint" />
          ) : (
            <input value={draft.questionId} readOnly aria-describedby="key-hint" />
          )}
          <span id="key-hint" className="muted small">
            {draft.isNew ? 'Lowercase letters, numbers and hyphens. Fixed once saved.' : 'Fixed: stored answers use this key.'}
          </span>
          <FieldError errors={errors} name="questionId" />
        </label>

        <label className="field">
          Help text <span className="muted small">(optional)</span>
          <textarea rows={2} value={draft.help} onChange={(e) => set({ help: e.target.value })} />
          <FieldError errors={errors} name="help" />
        </label>

        <div className="field-row">
          {draft.isNew && (
            <label className="field">
              Answer type
              <select value={draft.type} onChange={(e) => set({ type: e.target.value })}>
                {NEW_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <FieldError errors={errors} name="type" />
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={draft.required} onChange={(e) => set({ required: e.target.checked })} />
            Required
          </label>
        </div>

        {!isText && !noOptions && (
          <fieldset className="options">
            <legend>Options</legend>
            {!draft.isNew && SPECIAL.includes(draft.display) && (
              <p className="muted small">This question uses a custom display. Its options can be relabelled and new ones added.</p>
            )}
            <div className="option-head muted small"><span>Key</span><span>Label</span></div>
            {draft.options.map((o, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div className="option-row" key={i}>
                <input
                  aria-label={`Option ${i + 1} key`}
                  value={o.key}
                  readOnly={!o.isNew}
                  onChange={(e) => setOption(i, { key: e.target.value, keyTouched: true })}
                  className={KEY_RE.test(o.key) || !o.key ? '' : 'invalid'}
                />
                <input
                  aria-label={`Option ${i + 1} label`}
                  value={o.label}
                  onChange={(e) => setOption(i, { label: e.target.value, ...(o.isNew && !o.keyTouched ? { key: slug(e.target.value) } : {}) })}
                />
                {o.isNew ? (
                  <button type="button" className="ghost" onClick={() => setDraft((d) => ({ ...d, options: d.options.filter((_, j) => j !== i) }))}>Remove</button>
                ) : <span className="muted small locked">saved</span>}
              </div>
            ))}
            <button type="button" className="ghost" onClick={() => setDraft((d) => ({ ...d, options: [...d.options, { key: '', label: '', isNew: true }] }))}>+ Add option</button>
            {optionErrors.map((k) => <FieldError key={k} errors={errors} name={k} />)}
          </fieldset>
        )}

        <div className="editor-actions">
          <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save question'}</button>
          <button type="button" className="ghost" onClick={onClose} disabled={saving}>Cancel</button>
          {message && <span className={message.ok ? 'saved-note' : 'error'} role="status">{message.text}</span>}
        </div>
      </form>
    </aside>
  );
}

export default function QuestionsPage({
  token, org, profile, assessment, assessmentLabel,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [section, setSection] = useState('');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems((await fetchQuestions({ token, org, assessment })).items || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [token, org, assessment]);
  useEffect(() => { load(); }, [load]);

  const sections = useMemo(() => {
    const seen = new Map();
    items.forEach((q) => { if (!seen.has(q.section)) seen.set(q.section, { key: q.section, title: q.sectionTitle || q.section }); });
    return [...seen.values()];
  }, [items]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((x) => (!section || x.section === section) && (!q || [x.questionId, x.title, x.help, x.sectionTitle,
      ...(x.options || []).flatMap((o) => [o.id, o.label])].join(' ').toLowerCase().includes(q)));
  }, [items, section, query]);

  const open = (draftValue) => { setDraft(draftValue); setErrors(null); setMessage(null); };

  const save = async () => {
    setSaving(true);
    setErrors(null);
    setMessage(null);
    const d = draft;
    const question = {
      questionId: d.questionId.trim(),
      title: d.title,
      help: d.help,
      required: d.required,
      options: (d.isNew ? d.type === 'text' : d.display === 'text') ? [] : d.options.map((o) => ({ key: o.key.trim(), label: o.label })),
      ...(d.isNew ? { section: d.section.trim(), sectionTitle: d.sectionTitle, type: d.type } : { update: true }),
    };
    try {
      const res = await saveQuestion({
        token, org, assessment, question, editor: profile && (profile.email || profile.name),
      });
      const saved = res.question;
      setItems((list) => {
        const i = list.findIndex((x) => x.questionId === saved.questionId);
        const next = i >= 0 ? list.map((x, j) => (j === i ? saved : x)) : [...list, saved];
        return next.sort((a, b) => (a.sectionOrder - b.sectionOrder) || (a.order - b.order));
      });
      setDraft(toDraft(saved));
      setMessage({ ok: true, text: res.created ? 'Question added.' : 'Saved.' });
    } catch (e) {
      setErrors(e.errors);
      setMessage({ ok: false, text: e.status === 401 || e.status === 403 ? 'Your Adobe account is not authorized to edit questions.' : e.message });
    }
    setSaving(false);
  };

  return (
    <>
      <header className="top no-print">
        <div>
          <h1>Questions</h1>
          <p className="muted">{assessmentLabel} · {items.length} questions in {sections.length} sections</p>
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          <button type="button" className="primary" onClick={() => open(blank(section))}>Add question</button>
        </div>
      </header>

      <p className="muted small notice">
        The answers API checks answers against these questions, and changes apply there within about 30 seconds.
        The page on the EDS site still shows its own copy of the wording.
      </p>

      <section className="filters no-print">
        <label>
          Section
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">All sections</option>
            {sections.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}
          </select>
        </label>
        <label className="grow">
          Search
          <input type="search" placeholder="Question text, key, option…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </section>

      {error && <p role="alert" className="error">{error.status === 401 || error.status === 403 ? 'Your Adobe account is not authorized to read questions.' : `Could not load questions: ${error.message}`}</p>}

      <div className="layout">
        <div className="table-wrap">
          <table className="questions">
            <thead>
              <tr><th>Section</th><th>Key</th><th>Question</th><th>Type</th><th>Options</th><th>Required</th></tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr
                  key={q.questionId}
                  className={draft && !draft.isNew && draft.questionId === q.questionId ? 'on' : ''}
                  onClick={() => open(toDraft(q))}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open(toDraft(q))}
                  tabIndex={0}
                >
                  <td>{q.sectionTitle || q.section}</td>
                  <td><code>{q.questionId}</code></td>
                  <td className="q-text">{q.title}</td>
                  <td>{typeLabel(q)}</td>
                  <td title={(q.options || []).map((o) => `${o.id}: ${o.label}`).join('\n')}>{(q.options || []).length || '—'}</td>
                  <td>{q.required ? 'Yes' : ''}</td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr><td colSpan={6} className="empty">{items.length ? 'No questions match.' : 'No questions yet.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {draft && (
          <Editor
            draft={draft}
            setDraft={setDraft}
            sections={sections}
            onSave={save}
            onClose={() => setDraft(null)}
            saving={saving}
            errors={errors}
            message={message}
          />
        )}
      </div>
    </>
  );
}
