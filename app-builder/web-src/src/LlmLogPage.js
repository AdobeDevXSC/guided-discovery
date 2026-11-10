import React, { useCallback, useEffect, useState } from 'react';
import { fetchLlmLog, fetchLlmLogEntry, deleteLlmEntry, rerunLlmEntry } from './api';
import { fmt } from './Detail';

// LLM log: every query sent to the model, newest first - the admin's "Send to AI" and the wrap-up
// that runs when a user finishes the assessment. Click a row for the full system prompt, prompt,
// the assessment text that was sent, and the reply.

const denied = (e) => e && (e.status === 401 || e.status === 403);
const TRIGGER_LABELS = { manual: 'Admin', wrapup: 'Wrap-up' };
const secs = (ms) => (typeof ms === 'number' ? `${(ms / 1000).toFixed(1)}s` : '—');
const tokens = (u) => (u ? `${u.inputTokens} in / ${u.outputTokens} out` : '—');

function Block({ title, text }) {
  if (!text) return null;
  return (
    <details open={title === 'Reply'}>
      <summary>{title}</summary>
      <pre className="llm-pre">{text}</pre>
    </details>
  );
}

function Entry({
  entry, onClose, onDelete, deleting, onRerun, rerunning, error,
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { setConfirming(false); }, [entry.analysisId]);
  return (
    <aside className="detail question-editor" aria-label="LLM query">
      <div className="detail-head">
        <h2>LLM query</h2>
        <div className="actions">
          <button type="button" className="primary" onClick={onRerun} disabled={rerunning || deleting}>{rerunning ? 'Sending…' : 'Rerun'}</button>
          {!confirming ? (
            <button type="button" className="ghost" onClick={() => setConfirming(true)} disabled={deleting}>Delete</button>
          ) : (
            <>
              <button type="button" className="danger solid" onClick={onDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Yes, delete'}</button>
              <button type="button" className="ghost" onClick={() => setConfirming(false)} disabled={deleting}>Cancel</button>
            </>
          )}
          <button type="button" className="ghost" onClick={onClose}>Close</button>
        </div>
      </div>
      {confirming && (
        <p className="muted small">
          Delete this query permanently?{entry.trigger === 'wrapup' ? ' The user can then wrap up again.' : ''}
        </p>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <dl className="llm-meta">
        <dt>Reference</dt><dd><code>{entry.analysisId.slice(0, 8)}</code> <span className="muted small">({entry.analysisId})</span></dd>
        <dt>Status</dt><dd>{entry.status}{entry.error ? ` · ${entry.error}` : ''}</dd>
        <dt>Source</dt><dd>{TRIGGER_LABELS[entry.trigger] || entry.trigger}</dd>
        <dt>Model</dt><dd>{entry.model}</dd>
        <dt>Prompt</dt><dd>{entry.skillName || entry.promptName || '—'}</dd>
        <dt>Tokens</dt><dd>{tokens(entry.usage)}</dd>
        <dt>Time</dt><dd>{secs(entry.latencyMs)}</dd>
        <dt>Sent</dt><dd>{fmt(entry.createdAt)}</dd>
        <dt>Response</dt><dd><code>{entry.responseId}</code></dd>
      </dl>
      <Block title="System prompt (skill)" text={entry.systemText} />
      <Block title="Prompt" text={entry.promptText} />
      <Block title="Assessment sent" text={entry.input} />
      <Block title="Claude's JSON (filled into the template)" text={entry.rawOutput} />
      <Block title="Reply" text={entry.output} />
    </aside>
  );
}

export default function LlmLogPage({ token, org }) {
  const [state, setState] = useState({
    loading: true, error: null, items: [], total: 0,
  });
  const [filters, setFilters] = useState({ status: '', trigger: '', ref: '' });
  const [open, setOpen] = useState(null); // { id, entry?, error? }

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetchLlmLog({ token, org, status: filters.status, trigger: filters.trigger });
      const ref = filters.ref.trim().toLowerCase();
      const items = ref ? res.items.filter((r) => r.analysisId.startsWith(ref)) : res.items;
      setState({
        loading: false, error: null, items, total: ref ? items.length : res.total,
      });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e }));
    }
  }, [token, org, filters]);
  useEffect(() => { load(); }, [load]);

  const show = async (analysisId) => {
    setOpen({ id: analysisId });
    setDeleteError('');
    try {
      const res = await fetchLlmLogEntry({ token, org, analysisId });
      setOpen({ id: analysisId, entry: res.entry });
    } catch (e) {
      setOpen({ id: analysisId, error: e });
    }
  };

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const remove = async () => {
    const e = open && open.entry;
    if (!e) return;
    setDeleting(true); setDeleteError('');
    try {
      await deleteLlmEntry({ token, org, analysisId: e.analysisId });
      setOpen(null);
      load();
    } catch (err) {
      setDeleteError(denied(err) ? 'Your Adobe account is not authorized to delete queries.' : err.message);
    }
    setDeleting(false);
  };

  // follow a query that is still running until it finishes
  const openId = open && open.entry && open.entry.analysisId;
  const openStatus = open && open.entry && open.entry.status;
  useEffect(() => {
    if (!openId || (openStatus !== 'queued' && openStatus !== 'running')) return undefined;
    const t = setTimeout(async () => {
      try {
        const res = await fetchLlmLogEntry({ token, org, analysisId: openId });
        setOpen((o) => (o && o.id === openId ? { id: openId, entry: res.entry } : o));
        load();
      } catch (e) { /* the next refresh will show the problem */ }
    }, 4000);
    return () => clearTimeout(t);
  }, [openId, openStatus, open, token, org, load]);

  const [rerunning, setRerunning] = useState(false);
  const rerun = async () => {
    const e = open && open.entry;
    if (!e) return;
    setRerunning(true); setDeleteError('');
    try {
      const res = await rerunLlmEntry({ token, org, analysisId: e.analysisId });
      await load();
      show(res.analysis.analysisId);
    } catch (err) {
      setDeleteError(denied(err) ? 'Your Adobe account is not authorized to rerun queries.' : err.message);
    }
    setRerunning(false);
  };

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <header className="top no-print">
        <div>
          <h1>LLM log</h1>
          <p className="muted">Every query sent to Claude, newest first.</p>
        </div>
        <div className="actions">
          <select value={filters.trigger} onChange={set('trigger')} aria-label="Source">
            <option value="">All sources</option>
            <option value="wrapup">Wrap-up</option>
            <option value="manual">Admin</option>
          </select>
          <select value={filters.status} onChange={set('status')} aria-label="Status">
            <option value="">All statuses</option>
            {['queued', 'running', 'done', 'failed'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            type="search"
            value={filters.ref}
            onChange={set('ref')}
            placeholder="Reference"
            aria-label="Find by reference"
            size={10}
          />
          <button type="button" className="ghost" onClick={load} disabled={state.loading}>{state.loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </header>

      {state.error && (
        <p role="alert" className="error">
          {denied(state.error) ? 'Your Adobe account is not authorized to read the LLM log.' : `Could not load the log: ${state.error.message}`}
        </p>
      )}

      <div className="layout">
        <div className="settings-main">
          {!state.loading && !state.error && !state.items.length && <p className="muted">No LLM queries yet.</p>}
          {state.items.length > 0 && (
            <table className="llm-table">
              <thead>
                <tr>
                  <th>Reference</th><th>Sent</th><th>Source</th><th>Prompt</th><th>Status</th><th>Tokens</th><th>Time</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((r) => (
                  <tr key={r.analysisId} className={open && open.id === r.analysisId ? 'on' : ''}>
                    <td><code>{r.analysisId.slice(0, 8)}</code></td>
                    <td><button type="button" className="ghost inline" onClick={() => show(r.analysisId)}>{fmt(r.createdAt)}</button></td>
                    <td>{TRIGGER_LABELS[r.trigger] || r.trigger}</td>
                    <td>{r.skillName || r.promptName || '—'}</td>
                    <td>{r.status}</td>
                    <td>{tokens(r.usage)}</td>
                    <td>{secs(r.latencyMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {state.total > state.items.length && <p className="muted small">Showing the latest {state.items.length} of {state.total}.</p>}
        </div>
        {open && open.entry && <Entry entry={open.entry} onClose={() => setOpen(null)} onDelete={remove} deleting={deleting} onRerun={rerun} rerunning={rerunning} error={deleteError} />}
        {open && !open.entry && (
          <aside className="detail" aria-live="polite">
            {open.error ? <p role="alert" className="error">Could not load this query: {open.error.message}</p> : <p className="muted">Loading…</p>}
          </aside>
        )}
      </div>
    </>
  );
}
