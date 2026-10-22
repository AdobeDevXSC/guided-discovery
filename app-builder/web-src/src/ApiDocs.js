import React, { useEffect, useState } from 'react';
import {
  BASE_URL, OVERVIEW, SECTIONS, WALKTHROUGH, ANSWER_FORMATS,
} from './apiDocsData';

// Renders `code` spans in data strings as <code>.
function Text({ children }) {
  const parts = String(children).split('`');
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <code key={i}>{p}</code> : <React.Fragment key={i}>{p}</React.Fragment>))}
    </>
  );
}

function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied('Copied');
    } catch (e) {
      setCopied('Copy failed');
    }
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <div className="code">
      <div className="code-head">
        <span>{label}</span>
        <button type="button" className="ghost no-print" onClick={copy} aria-label={`Copy ${label || 'code'}`}>
          {copied || 'Copy'}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function FieldTable({ label, rows }) {
  return (
    <>
      <h4>{label}</h4>
      <div className="table-scroll">
        <table>
          <thead>
            <tr><th>Name</th><th>Type</th><th>Required</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {rows.map(([name, type, required, notes]) => (
              <tr key={name}>
                <td><code>{name}</code></td>
                <td><code>{type}</code></td>
                <td>{required}</td>
                <td><Text>{notes}</Text></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Operation({ op, action }) {
  return (
    <article className="op" id={op.id}>
      <h3 className="op-title">
        <span className={`method ${op.method.toLowerCase()}`}>{op.method}</span>
        {op.title}
      </h3>
      <p className="endpoint"><code>{`${op.method} /${action}`}</code></p>
      <p><Text>{op.summary}</Text></p>
      {op.fields && <FieldTable label={op.fieldsLabel || 'Body'} rows={op.fields} />}
      {(op.extraTables || []).map((t) => <FieldTable key={t.label} label={t.label} rows={t.rows} />)}

      <h4>Success</h4>
      <CodeBlock label={`${op.success.status}`} code={op.success.body} />

      {op.errors && op.errors.length > 0 && (
        <>
          <h4>Other responses</h4>
          {op.errors.map((e) => (
            <div key={`${e.status}-${e.when}`} className="err">
              <p><span className="status">{e.status}</span> <Text>{e.when}</Text></p>
              <pre><code>{e.body}</code></pre>
            </div>
          ))}
        </>
      )}

      <h4>Examples</h4>
      <CodeBlock label="curl" code={op.curl} />
      <CodeBlock label="fetch (browser)" code={op.fetch} />
      {op.notes && (
        <ul className="notes">
          {op.notes.map((n) => <li key={n}><Text>{n}</Text></li>)}
        </ul>
      )}
    </article>
  );
}

const TOC = [
  { id: 'overview', title: 'Overview' },
  { id: 'walkthrough', title: 'Walkthrough' },
  ...SECTIONS.map((s) => ({ id: s.id, title: s.title, children: s.ops.map((o) => ({ id: o.id, title: o.title })) })),
  { id: 'answer-formats', title: 'Answer value formats' },
];

// The viewer routes by hash (#api), so in-page links are #api/<id>: clicking scrolls without
// changing the page, and opening a shared #api/<id> link scrolls to that part on load.
const scrollToPart = (id) => {
  const el = id && document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return Boolean(el);
};

function PartLink({ id, children }) {
  const go = (e) => {
    e.preventDefault();
    if (scrollToPart(id)) window.history.replaceState(null, '', `#api/${id}`);
  };
  return <a href={`#api/${id}`} onClick={go}>{children}</a>;
}

export default function ApiDocs() {
  useEffect(() => {
    const id = window.location.hash.replace(/^#\/?api\/?/, '');
    if (id) scrollToPart(id);
  }, []);
  return (
    <div className="api-docs">
      <header>
        <h1>API reference</h1>
        <p className="muted">HTTP APIs for assessment profiles, responses and administration (Stage).</p>
      </header>

      <nav className="toc" aria-label="Contents">
        <h2>Contents</h2>
        <ol>
          {TOC.map((t) => (
            <li key={t.id}>
              <PartLink id={t.id}>{t.title}</PartLink>
              {t.children && t.children.length > 0 && (
                <ol>
                  {t.children.map((c) => <li key={c.id}><PartLink id={c.id}>{c.title}</PartLink></li>)}
                </ol>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <section id="overview">
        <h2>Overview</h2>
        {OVERVIEW.intro.map((p) => <p key={p}><Text>{p}</Text></p>)}

        <h4>Base URL</h4>
        <p><code className="wrap">{BASE_URL}/&lt;action&gt;</code></p>
        <p className="muted">The examples assume one of these:</p>
        <CodeBlock label="shell" code={OVERVIEW.setup} />
        <CodeBlock label="JavaScript" code={OVERVIEW.setupFetch} />

        <h4>Authentication</h4>
        <ul>{OVERVIEW.auth.map((p) => <li key={p}><Text>{p}</Text></li>)}</ul>

        <h4>CORS</h4>
        <p><Text>{OVERVIEW.cors.intro}</Text></p>
        <ul>{OVERVIEW.cors.origins.map((p) => <li key={p}><Text>{p}</Text></li>)}</ul>
        <ul>{OVERVIEW.cors.rules.map((p) => <li key={p}><Text>{p}</Text></li>)}</ul>

        <h4>Errors</h4>
        {OVERVIEW.errors.map((p) => <p key={p}><Text>{p}</Text></p>)}
        <CodeBlock label="400" code={OVERVIEW.errorExample} />

        <h4>Status codes</h4>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
            <tbody>
              {OVERVIEW.statuses.map(([s, m]) => (
                <tr key={s}><td><span className="status">{s}</span></td><td><Text>{m}</Text></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="walkthrough">
        <h2>Walkthrough</h2>
        <p><Text>{WALKTHROUGH.intro}</Text></p>
        <ol className="steps">
          {WALKTHROUGH.steps.map((s) => (
            <li key={s.title}>
              <h4>{s.title}</h4>
              <p><Text>{s.text}</Text></p>
              <CodeBlock label="fetch (browser)" code={s.code} />
            </li>
          ))}
        </ol>
      </section>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className={s.placeholder ? 'placeholder' : undefined}>
          <h2>{s.title} <code className="action">{s.action}</code></h2>
          {s.placeholder && <p className="todo">TODO: not documented yet.</p>}
          {s.intro.map((p) => <p key={p}><Text>{p}</Text></p>)}
          {s.notes && <ul className="notes">{s.notes.map((n) => <li key={n}><Text>{n}</Text></li>)}</ul>}
          {s.ops.map((op) => <Operation key={op.id} op={op} action={s.action} />)}
        </section>
      ))}

      <section id="answer-formats">
        <h2>Answer value formats</h2>
        <p><Text>{ANSWER_FORMATS.intro}</Text></p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Display</th><th>Value</th><th>Examples</th></tr></thead>
            <tbody>
              {ANSWER_FORMATS.rows.map(([d, v, ex]) => (
                <tr key={d}><td><Text>{d}</Text></td><td><Text>{v}</Text></td><td><Text>{ex}</Text></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted"><Text>{ANSWER_FORMATS.limits}</Text></p>
      </section>
    </div>
  );
}
