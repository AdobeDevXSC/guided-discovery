import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useShellAuth from './useShellAuth';
import {
  fetchRecords, deleteRecord, deleteRecords, fetchAnswersExport,
} from './api';
import { toCsv, download } from './csv';
import Detail from './Detail';
import QuestionsPage from './QuestionsPage';
import ApiDocs from './ApiDocs';
import SettingsPage from './SettingsPage';
import { ASSESSMENTS, answerColumns } from './datasets';
import './App.css';

const ASSESSMENT_KEYS = Object.keys(ASSESSMENTS);

// Pages of the viewer, addressable by hash (#questions) so they can be linked to.
const VIEWS = [['profiles', 'Profiles'], ['questions', 'Questions'], ['settings', 'Settings'], ['api', 'API reference']];
const viewFromHash = () => {
  const h = window.location.hash.replace(/^#\/?/, '').split('/')[0]; // #api/<part> is still the api page
  return VIEWS.some(([k]) => k === h) ? h : 'profiles';
};
function useView() {
  const [view, setView] = useState(viewFromHash);
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return view;
}

function Nav({ view }) {
  return (
    <nav className="views no-print" aria-label="Viewer">
      {VIEWS.map(([key, label]) => (
        <a key={key} href={`#${key}`} className={key === view ? 'on' : ''} aria-current={key === view ? 'page' : undefined}>{label}</a>
      ))}
    </nav>
  );
}
const DELETE_BATCH = 100; // the admin action's per-request limit

function BulkDelete({ count, onDelete, onClear }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { setConfirming(false); setErr(null); }, [count]);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onDelete(); // on success the selection clears and this bar unmounts
    } catch (e) {
      setErr(e.status === 401 || e.status === 403 ? 'Your Adobe account is not authorized to delete profiles.' : e.message);
      setBusy(false);
      setConfirming(false);
    }
  };
  const noun = count === 1 ? 'profile' : 'profiles';
  return (
    <div className="bulk no-print" role="region" aria-label="Selected profiles">
      <strong>{count} selected</strong>
      {!confirming ? (
        <>
          <button type="button" className="danger" onClick={() => setConfirming(true)}>Delete selected</button>
          <button type="button" className="ghost" onClick={onClear}>Clear selection</button>
        </>
      ) : (
        <>
          <span role="alert">Permanently delete {count} {noun}? This cannot be undone.</span>
          <button type="button" className="danger solid" onClick={run} disabled={busy}>{busy ? 'Deleting…' : `Yes, delete ${count}`}</button>
          <button type="button" className="ghost" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
        </>
      )}
      {err && <span role="alert" className="error">{err}</span>}
    </div>
  );
}

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
  const view = useView();
  const [assessment, setAssessment] = useState(ASSESSMENT_KEYS[0]);
  const ds = ASSESSMENTS[assessment];
  const { dataset } = ds;
  const [checked, setChecked] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
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
      setData(await fetchRecords({
        token, org, dataset, assessment: ds.assessment,
      }));
      setChecked(new Set());
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [token, org, dataset, ds.assessment]);

  useEffect(() => {
    if (auth.status === 'ready' && view === 'profiles') load();
  }, [auth.status, load, view]);

  const handleDelete = useCallback(async (item) => {
    const id = ds.id(item);
    await deleteRecord({ token, org, dataset, id });
    setSelected(null);
    setData((d) => ({ items: d.items.filter((r) => ds.id(r) !== id), total: Math.max(0, d.total - 1) }));
    setChecked((c) => { const n = new Set(c); n.delete(id); return n; });
  }, [token, org, dataset, ds]);

  const handleBulkDelete = useCallback(async () => {
    const ids = [...checked];
    const gone = new Set();
    for (let i = 0; i < ids.length; i += DELETE_BATCH) {
      const batch = ids.slice(i, i + DELETE_BATCH);
      // eslint-disable-next-line no-await-in-loop
      await deleteRecords({
        token, org, dataset, ids: batch,
      });
      // already-deleted ids (notFound) are gone either way
      batch.forEach((id) => gone.add(id));
    }
    setData((d) => {
      const items = d.items.filter((r) => !gone.has(ds.id(r)));
      return { items, total: Math.max(0, d.total - (d.items.length - items.length)) };
    });
    setChecked(new Set());
    if (selected && gone.has(ds.id(selected))) setSelected(null);
  }, [checked, token, org, dataset, ds, selected]);

  const toggle = (id) => setChecked((c) => {
    const n = new Set(c);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const switchAssessment = (key) => {
    setSelected(null);
    setQuery('');
    setChecked(new Set());
    setData({ items: [], total: 0 });
    setAssessment(key);
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? data.items.filter((r) => ds.haystack(r).includes(q)) : data.items;
  }, [data.items, query, ds]);

  // the profile columns, plus each profile's latest answers when the assessment has them
  const exportCsv = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      let columns = ds.csv;
      if (ds.exportAnswers) {
        columns = answerColumns(ds, await fetchAnswersExport({ token, org, assessment: ds.assessment }));
      }
      download(`${ds.file}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(columns, rows));
    } catch (e) {
      setExportError(e.message);
    }
    setExporting(false);
  }, [ds, token, org, rows]);

  const visibleIds = rows.map((r) => ds.id(r));
  const allVisibleChecked = visibleIds.length > 0 && visibleIds.every((id) => checked.has(id));
  const someVisibleChecked = visibleIds.some((id) => checked.has(id));
  const toggleAllVisible = () => setChecked((c) => {
    const n = new Set(c);
    if (allVisibleChecked) visibleIds.forEach((id) => n.delete(id));
    else visibleIds.forEach((id) => n.add(id));
    return n;
  });

  // the same person can submit more than once; userId (or email for older records) groups them
  const people = useMemo(() => new Set(data.items.map((r) => ds.person(r)).filter(Boolean)).size, [data.items, ds]);
  const inProgress = useMemo(() => (ds.inProgress ? data.items.filter(ds.inProgress).length : 0), [data.items, ds]);

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

  if (view === 'api') {
    return (
      <div className="viewer">
        <Nav view={view} />
        <ApiDocs />
      </div>
    );
  }

  if (view === 'settings') {
    return (
      <div className="viewer">
        <Nav view={view} />
        <SettingsPage token={token} org={org} profile={auth.profile} />
      </div>
    );
  }

  if (view === 'questions') {
    return (
      <div className="viewer">
        <Nav view={view} />
        <QuestionsPage token={token} org={org} profile={auth.profile} assessment={ds.assessment} assessmentLabel={ds.label} />
      </div>
    );
  }

  return (
    <div className="viewer">
      <Nav view={view} />
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
            disabled={!rows.length || exporting}
            onClick={exportCsv}
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
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
        {ds.inProgress && <div className="stat-in-progress"><strong>{inProgress}</strong><span>In progress</span></div>}
      </section>

      <section className="filters no-print">
        <label className="grow">
          Search
          <input type="search" placeholder="Name, email, organization, product…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </section>

      {exportError && <p role="alert" className="error">Could not export: {exportError}</p>}

      {checked.size > 0 && (
        <BulkDelete count={checked.size} onDelete={handleBulkDelete} onClear={() => setChecked(new Set())} />
      )}

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
                <th className="pick no-print">
                  <input
                    type="checkbox"
                    aria-label="Select all shown profiles"
                    checked={allVisibleChecked}
                    ref={(el) => { if (el) el.indeterminate = someVisibleChecked && !allVisibleChecked; }}
                    onChange={toggleAllVisible}
                    disabled={!rows.length}
                  />
                </th>
                {ds.table.map(([label]) => <th key={label}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={ds.id(r)}
                  className={[selected && ds.id(selected) === ds.id(r) ? 'on' : '', ds.inProgress && ds.inProgress(r) ? 'in-progress' : ''].filter(Boolean).join(' ') || undefined}
                  onClick={() => setSelected(r)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(r)}
                  tabIndex={0}
                >
                  {/* the checkbox selects for bulk delete; clicking elsewhere on the row opens the detail */}
                  <td className="pick no-print" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${ds.name(r)}`}
                      checked={checked.has(ds.id(r))}
                      onChange={() => toggle(ds.id(r))}
                    />
                  </td>
                  {ds.table.map(([label, cell]) => <td key={label}>{cell(r)}</td>)}
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr><td colSpan={ds.table.length + 1} className="empty">{data.items.length ? 'No profiles match your search.' : 'No profiles yet.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {selected && (
          <Detail id={ds.id(selected)} title={ds.name(selected)} onClose={() => setSelected(null)} onDelete={() => handleDelete(selected)}>
            <ds.Body item={selected} auth={{ token, org }} />
          </Detail>
        )}
      </div>
    </div>
  );
}
