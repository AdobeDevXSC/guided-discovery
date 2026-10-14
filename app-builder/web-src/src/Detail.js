import React, { useEffect, useState } from 'react';

export const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
const show = (v) => (Array.isArray(v) ? (v.length ? v.join(', ') : '—') : v === null || v === undefined || v === '' ? '—' : String(v));

export function Fields({ rows }) {
  return (
    <dl className="fields">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{k}</dt>
          <dd>{show(v)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

// Detail panel shell: title, id, the two-step delete control, and the dataset-specific body.
export default function Detail({ id, title, onClose, onDelete, children }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // reset the confirm step when a different record is selected
  useEffect(() => { setConfirming(false); setBusy(false); setErr(null); }, [id]);

  const doDelete = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onDelete();
    } catch (e) {
      setErr(e.status === 401 || e.status === 403 ? 'Your Adobe account is not authorized to delete submissions.' : e.message);
      setBusy(false);
    }
  };
  return (
    <aside className="detail" aria-label="Submission detail">
      <div className="detail-head">
        <h2>{title}</h2>
        <button type="button" className="ghost no-print" onClick={onClose}>Close</button>
      </div>
      <p className="muted">{id}</p>

      <div className="delete-zone no-print">
        {!confirming ? (
          <button type="button" className="danger" onClick={() => setConfirming(true)}>Delete submission</button>
        ) : (
          <>
            <p role="alert">Permanently delete this submission? This cannot be undone.</p>
            <button type="button" className="danger solid" onClick={doDelete} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
            <button type="button" className="ghost" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
          </>
        )}
        {err && <p role="alert" className="error">{err}</p>}
      </div>
      {children}
    </aside>
  );
}
