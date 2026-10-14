import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useShellAuth from './useShellAuth';
import { fetchRecords, deleteRecord } from './api';
import { toCsv, download } from './csv';
import Detail from './Detail';
import { DATASETS } from './datasets';
import './App.css';

const STATUS_OPTIONS = [
  ['', 'All statuses'],
  ['started', 'Started'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
];

const DATASET_KEYS = Object.keys(DATASETS);

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
  const [dataset, setDataset] = useState(DATASET_KEYS[0]);
  const ds = DATASETS[dataset];
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
      setData(await fetchRecords({ token, org, dataset, status }));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [token, org, dataset, status]);

  useEffect(() => {
    if (auth.status === 'ready') load();
  }, [auth.status, load]);

  const handleDelete = useCallback(async (item) => {
    const id = ds.id(item);
    await deleteRecord({ token, org, dataset, id });
    setSelected(null);
    setData((d) => ({ items: d.items.filter((r) => ds.id(r) !== id), total: Math.max(0, d.total - 1) }));
  }, [token, org, dataset, ds]);

  const switchDataset = (key) => {
    setSelected(null);
    setQuery('');
    setData({ items: [], total: 0 });
    setDataset(key);
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? data.items.filter((r) => ds.haystack(r).includes(q)) : data.items;
  }, [data.items, query, ds]);

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
          <h1>{ds.title}</h1>
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
            onClick={() => download(`${ds.file}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(ds.csv, rows))}
          >
            Export CSV
          </button>
        </div>
      </header>

      <nav className="tabs no-print" aria-label="Dataset">
        {DATASET_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={key === dataset ? 'tab on' : 'tab'}
            aria-current={key === dataset ? 'page' : undefined}
            onClick={() => switchDataset(key)}
          >
            {DATASETS[key].label}
          </button>
        ))}
      </nav>

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
                {ds.table.map(([label]) => <th key={label}>{label}</th>)}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={ds.id(r)}
                  className={selected && ds.id(selected) === ds.id(r) ? 'on' : ''}
                  onClick={() => setSelected(r)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(r)}
                  tabIndex={0}
                >
                  {ds.table.map(([label, cell]) => <td key={label}>{cell(r)}</td>)}
                  <td><span className={`pill ${r.status}`}>{r.status.replace('_', ' ')}</span></td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr><td colSpan={ds.table.length + 1} className="empty">{data.items.length ? 'No submissions match your search.' : 'No submissions yet.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {selected && (
          <Detail id={ds.id(selected)} title={ds.name(selected)} onClose={() => setSelected(null)} onDelete={() => handleDelete(selected)}>
            <ds.Body item={selected} />
          </Detail>
        )}
      </div>
    </div>
  );
}
