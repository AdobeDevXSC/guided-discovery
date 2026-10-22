import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useShellAuth from './useShellAuth';
import { fetchRecords, deleteRecord } from './api';
import { toCsv, download } from './csv';
import Detail from './Detail';
import { ASSESSMENTS } from './datasets';
import './App.css';

const ASSESSMENT_KEYS = Object.keys(ASSESSMENTS);

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
  const [assessment, setAssessment] = useState(ASSESSMENT_KEYS[0]);
  const ds = ASSESSMENTS[assessment];
  const { dataset } = ds;
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
      setData(await fetchRecords({ token, org, dataset }));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [token, org, dataset]);

  useEffect(() => {
    if (auth.status === 'ready') load();
  }, [auth.status, load]);

  const handleDelete = useCallback(async (item) => {
    const id = ds.id(item);
    await deleteRecord({ token, org, dataset, id });
    setSelected(null);
    setData((d) => ({ items: d.items.filter((r) => ds.id(r) !== id), total: Math.max(0, d.total - 1) }));
  }, [token, org, dataset, ds]);

  const switchAssessment = (key) => {
    setSelected(null);
    setQuery('');
    setData({ items: [], total: 0 });
    setAssessment(key);
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? data.items.filter((r) => ds.haystack(r).includes(q)) : data.items;
  }, [data.items, query, ds]);

  // the same person can submit more than once; userId (or email for older records) groups them
  const people = useMemo(() => new Set(data.items.map((r) => ds.person(r)).filter(Boolean)).size, [data.items, ds]);

  if (auth.status === 'waiting') {
    return <Notice title="Connecting to Experience Cloud…"><p>Waiting for your Adobe sign-in.</p></Notice>;
  }
  if (auth.status === 'outside') {
    const shell = `https://experience.adobe.com/?devMode=true#/custom-apps/?localDevUrl=${encodeURIComponent(window.location.href.split('#')[0])}`;
    return (
      <Notice title="Open this app in Experience Cloud Shell">
        <p>
          Profiles contain personal data, so this page only works when it is signed in through
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
          <h1>{ds.label}</h1>
          <p className="muted">
            {data.total} {data.total === 1 ? 'profile' : 'profiles'}
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

      {ASSESSMENT_KEYS.length > 1 && (
        <nav className="tabs no-print" aria-label="Assessment">
          {ASSESSMENT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={key === assessment ? 'tab on' : 'tab'}
              aria-current={key === assessment ? 'page' : undefined}
              onClick={() => switchAssessment(key)}
            >
              {ASSESSMENTS[key].label}
            </button>
          ))}
        </nav>
      )}

      <section className="stats no-print" aria-label="Summary">
        <div><strong>{data.items.length}</strong><span>Profiles</span></div>
        <div><strong>{people}</strong><span>People</span></div>
      </section>

      <section className="filters no-print">
        <label className="grow">
          Search
          <input type="search" placeholder="Name, email, organization, product…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </section>

      {error && (
        <p role="alert" className="error">
          {denied
            ? 'Your Adobe account is not authorized to read these profiles.'
            : `Could not load profiles: ${error.message}`}
        </p>
      )}

      <div className="layout">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {ds.table.map(([label]) => <th key={label}>{label}</th>)}
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
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr><td colSpan={ds.table.length} className="empty">{data.items.length ? 'No profiles match your search.' : 'No profiles yet.'}</td></tr>
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
