import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useShellAuth from './useShellAuth';
import { fetchAssessments, deleteAssessment } from './api';
import { toCsv, download } from './csv';
import Detail from './Detail';
import './App.css';

const STATUS_OPTIONS = [
  ['', 'All statuses'],
  ['started', 'Started'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
];

const COLUMNS = [
  { label: 'Created', value: (r) => r.createdAt },
  { label: 'Status', value: (r) => r.status },
  { label: 'First name', value: (r) => r.profile.firstName },
  { label: 'Last name', value: (r) => r.profile.lastName },
  { label: 'Email', value: (r) => r.profile.email },
  { label: 'Phone', value: (r) => r.profile.phone },
  { label: 'Job title', value: (r) => r.profile.jobTitle },
  { label: 'Department', value: (r) => r.profile.department },
  { label: 'Organization', value: (r) => r.profile.organization },
  { label: 'Country', value: (r) => (r.profile.country === 'Other' ? r.profile.countryOther : r.profile.country) },
  { label: 'State', value: (r) => r.profile.state },
  { label: 'Postal code', value: (r) => r.profile.postalCode },
  { label: 'Primary product', value: (r) => r.profile.primaryProduct },
  { label: 'Industry', value: (r) => r.profile.industry },
  { label: 'Source', value: (r) => r.source && r.source.source },
  { label: 'Completed', value: (r) => r.completedAt },
  { label: 'Submission ID', value: (r) => r.submissionId },
];

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
const haystack = (r) => [
  r.profile.firstName, r.profile.lastName, r.profile.email, r.profile.organization,
  r.profile.jobTitle, r.profile.country, r.profile.primaryProduct, r.profile.industry,
  r.source && r.source.source, r.submissionId,
].join(' ').toLowerCase();

function Notice({ title, children }) {
  return (
    <main className="shell-notice">
      <h1>{title}</h1>
      {children}
    </main>
  );
}

export default function App() {
  const auth = useShellAuth();
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const { token, org } = auth;
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAssessments({ token, org, status }));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [token, org, status]);

  useEffect(() => {
    if (auth.status === 'ready') load();
  }, [auth.status, load]);

  const handleDelete = useCallback(async (item) => {
    await deleteAssessment({ token, org, submissionId: item.submissionId });
    setSelected(null);
    setData((d) => ({ items: d.items.filter((r) => r.submissionId !== item.submissionId), total: Math.max(0, d.total - 1) }));
  }, [token, org]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? data.items.filter((r) => haystack(r).includes(q)) : data.items;
  }, [data.items, query]);

  const counts = useMemo(() => data.items.reduce((c, r) => ({ ...c, [r.status]: (c[r.status] || 0) + 1 }), {}), [data.items]);

  if (auth.status === 'waiting') {
    return <Notice title="Connecting to Experience Cloud…"><p>Waiting for your Adobe sign-in.</p></Notice>;
  }
  if (auth.status === 'outside') {
    const shell = `https://experience.adobe.com/?devMode=true#/custom-apps/?localDevUrl=${encodeURIComponent(window.location.href.split('#')[0])}`;
    return (
      <Notice title="Open this app in Experience Cloud Shell">
        <p>
          Submissions contain personal data, so this page only works when it is signed in through
          Experience Cloud Shell.
        </p>
        <p><a className="button" href={shell}>Open in Experience Cloud Shell</a></p>
      </Notice>
    );
  }
  if (auth.status === 'error') {
    return <Notice title="Could not read your Adobe session"><p>{auth.message}</p></Notice>;
  }

  const denied = error && (error.status === 401 || error.status === 403);

  return (
    <div className="viewer">
      <header className="top no-print">
        <div>
          <h1>CJA assessment submissions</h1>
          <p className="muted">
            {data.total} {status ? STATUS_OPTIONS.find((o) => o[0] === status)[1].toLowerCase() : 'total'}
            {data.total > data.items.length ? ` · showing newest ${data.items.length}` : ''}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
          <button type="button" className="ghost" onClick={() => window.print()} disabled={!rows.length}>Print</button>
          <button
            type="button"
            className="primary"
            disabled={!rows.length}
            onClick={() => download(`cja-assessments-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(COLUMNS, rows))}
          >
            Export CSV
          </button>
        </div>
      </header>

      <section className="stats no-print" aria-label="Summary">
        <div><strong>{data.items.length}</strong><span>Loaded</span></div>
        <div><strong>{counts.completed || 0}</strong><span>Completed</span></div>
        <div><strong>{counts.in_progress || 0}</strong><span>In progress</span></div>
        <div><strong>{counts.started || 0}</strong><span>Started</span></div>
      </section>

      <section className="filters no-print">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="grow">
          Search
          <input type="search" placeholder="Name, email, organization, product…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </section>

      {error && (
        <p role="alert" className="error">
          {denied
            ? 'Your Adobe account is not authorized to read these submissions.'
            : `Could not load submissions: ${error.message}`}
        </p>
      )}

      <div className="layout">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Created</th><th>Name</th><th>Email</th><th>Organization</th>
                <th>Country</th><th>Product</th><th>Industry</th><th>Status</th><th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.submissionId}
                  className={selected && selected.submissionId === r.submissionId ? 'on' : ''}
                  onClick={() => setSelected(r)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(r)}
                  tabIndex={0}
                >
                  <td>{when(r.createdAt)}</td>
                  <td>{r.profile.firstName} {r.profile.lastName}</td>
                  <td>{r.profile.email}</td>
                  <td>{r.profile.organization}</td>
                  <td>{r.profile.country === 'Other' ? r.profile.countryOther : r.profile.country}</td>
                  <td>{r.profile.primaryProduct}</td>
                  <td>{r.profile.industry}</td>
                  <td><span className={`pill ${r.status}`}>{r.status.replace('_', ' ')}</span></td>
                  <td>{(r.source && r.source.source) || '—'}</td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr><td colSpan="9" className="empty">{data.items.length ? 'No submissions match your search.' : 'No submissions yet.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {selected && <Detail item={selected} onClose={() => setSelected(null)} onDelete={handleDelete} />}
      </div>
    </div>
  );
}
