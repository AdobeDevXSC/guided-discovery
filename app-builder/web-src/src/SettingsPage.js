import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchSettings, saveAiSettings, savePrompt, deletePrompt, saveSkill, saveTemplate, previewTemplate,
} from './api';
import { unzipSync } from 'fflate';
import { fmt } from './Detail';

// Files in a skill zip that are read as resources; anything else (images, binaries) is skipped.
const TEXT_FILE = /\.(md|markdown|txt|json|ya?ml|csv|tsv|html?|xml|css|js|ts|py|sql)$/i;

// Settings: the Amazon Bedrock API key and the prompts stored for sending assessment results to Claude.
// The key is write-only: it is sent once, stored encrypted on the server and used only for
// server-to-server calls; the page only learns whether one is saved and its last four characters.

const denied = (e) => e && (e.status === 401 || e.status === 403);
const errorText = (e, what) => (denied(e) ? `Your Adobe account is not authorized to ${what}.` : e.message);

function FieldError({ errors, name }) {
  const msg = errors && errors[name];
  return msg ? <span className="field-error" role="alert">{msg}</span> : null;
}

function ApiKey({
  token, org, editor, ai, onSaved,
}) {
  const [apiKey, setApiKey] = useState('');
  const [replacing, setReplacing] = useState(!ai.hasKey);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState(null);
  const [message, setMessage] = useState(null);
  useEffect(() => { setReplacing(!ai.hasKey); setApiKey(''); }, [ai]);

  const save = async (body, done) => {
    setSaving(true); setErrors(null); setMessage(null);
    try {
      const res = await saveAiSettings({
        token, org, editor, ai: body,
      });
      onSaved(res.ai);
      setMessage({ ok: true, text: done });
    } catch (e) {
      setErrors(e.errors);
      setMessage({ ok: false, text: errorText(e, 'change settings') });
    }
    setSaving(false);
  };

  return (
    <section className="settings-card" aria-labelledby="ai-h">
      <h2 id="ai-h">AI service</h2>
      <p className="muted small">Claude on Amazon Bedrock (us-east-2). Assessment results are sent to Claude server to server. Use a long-term Bedrock API key.</p>
      <form onSubmit={(e) => { e.preventDefault(); save({ apiKey }, 'API key saved.'); }}>
        <div className="field">
          <span>API key</span>
          {ai.hasKey && !replacing ? (
            <div className="secret-saved">
              <span>
                Saved
                <span className="muted"> · ends in </span>
                <code>{`••••${ai.keyHint}`}</code>
              </span>
              <button type="button" className="ghost" onClick={() => setReplacing(true)}>Replace</button>
              <button type="button" className="ghost danger-text" onClick={() => save({ clearKey: true }, 'API key removed.')} disabled={saving}>Remove</button>
            </div>
          ) : (
            <>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                spellCheck="false"
                placeholder="ABSK…"
                aria-label="API key"
              />
              <span className="muted small">Stored encrypted on the server. It isn&apos;t shown again after saving.</span>
              {ai.hasKey && <button type="button" className="ghost inline" onClick={() => { setReplacing(false); setApiKey(''); }}>Keep the saved key</button>}
            </>
          )}
          <FieldError errors={errors} name="apiKey" />
        </div>
        <div className="editor-actions">
          {(!ai.hasKey || replacing) && <button type="submit" className="primary" disabled={saving || !apiKey.trim()}>{saving ? 'Saving…' : 'Save API key'}</button>}
          {message && <span className={message.ok ? 'saved-note' : 'error'} role="status">{message.text}</span>}
        </div>
        {ai.updatedAt && <p className="muted small">Last changed {fmt(ai.updatedAt)}{ai.updatedBy ? ` by ${ai.updatedBy}` : ''}</p>}
      </form>
    </section>
  );
}

const STARTER_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{{computed.company}} | Analytics Modernization Guide</title>
<style>
  @page { size: 1920px 1080px; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; color: #2c2c2c; background: #e9e9e9; }
  .slide { width: 1920px; height: 1080px; padding: 120px 140px; background: #fff; break-after: page; page-break-after: always; }
  .slide.dark { background: #1b1b1b; color: #fff; }
  h1 { font-size: 88px; margin: 0 0 24px; }
  h2 { font-size: 56px; margin: 0 0 40px; }
  p, li { font-size: 32px; line-height: 1.45; }
  .big { font-size: 160px; font-weight: 700; color: #3b63fb; }
  .muted { color: #6b6b6b; }
  @media screen { .slide { margin: 24px auto; zoom: 0.5; } }
</style>
</head>
<body>
<section class="slide dark">
  <p class="muted">{{computed.date}}</p>
  <h1>{{headline}}</h1>
  <p>{{computed.company}} | Analytics modernization assessment</p>
</section>
<section class="slide">
  <h2>Where you are today</h2>
  <div class="big">{{computed.readinessPct}}%</div>
  <p><strong>{{computed.band}}</strong></p>
  <p>{{summary}}</p>
</section>
<section class="slide">
  <h2>Your priorities</h2>
  <ol>
    {{#each priorities}}
    <li><strong>{{title}}.</strong> {{detail}}</li>
    {{/each}}
  </ol>
</section>
<section class="slide">
  <h2>Recommended next steps</h2>
  <p class="muted">Recommended engagement: {{computed.engagement.label}} {{computed.engagement.duration}}</p>
  <ul>
    {{#each next_steps}}
    <li>{{this}}</li>
    {{/each}}
  </ul>
</section>
</body>
</html>
`;

// The wrap-up template: HTML with {{fields}}. With one saved, Claude returns only the content as JSON and the
// guide is this template filled with it (much faster than having Claude write the whole document).
function TemplateCard({
  token, org, editor, template, onSaved,
}) {
  const [text, setText] = useState((template && template.text) || '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState(null);
  const [message, setMessage] = useState(null);
  const [preview, setPreview] = useState(null); // { html, fields } | { error }
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { setText((template && template.text) || ''); }, [template]);

  const loadFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) { setText(await file.text()); setPreview(null); }
  };

  const run = async (what, fn) => {
    setSaving(true); setErrors(null); setMessage(null);
    try { await fn(); } catch (e) {
      setErrors(e.errors);
      setMessage({ ok: false, text: e.errors && e.errors.text ? `Template: ${e.errors.text}` : errorText(e, what) });
    }
    setSaving(false);
  };

  const save = () => run('change the template', async () => {
    const res = await saveTemplate({ token, org, editor, template: { text } });
    onSaved(res.template);
    setMessage({ ok: true, text: 'Template saved. New wrap-ups will use it.' });
  });
  const show = () => run('preview the template', async () => {
    const res = await previewTemplate({ token, org, template: { text } });
    setPreview({ html: res.html, fields: res.fields });
  });
  const remove = () => run('remove the template', async () => {
    await saveTemplate({
      token, org, editor, clear: true,
    });
    onSaved(null); setText(''); setPreview(null); setConfirming(false);
    setMessage({ ok: true, text: 'Template removed. Wrap-ups return Claude’s reply as it is.' });
  });

  return (
    <section className="settings-card" aria-labelledby="template-h">
      <h2 id="template-h">Wrap-up template</h2>
      <p className="muted small">
        Optional. HTML with <code>{'{{field}}'}</code> placeholders. When one is saved, Claude is asked only for the content as JSON
        and the guide is this template filled with it, which is much faster than writing the whole document.
        Use <code>{'{{#each list}}…{{/each}}'}</code> for repeated items and <code>{'{{computed.readinessPct}}'}</code>,
        <code>{' {{computed.company}}'}</code>, <code>{'{{computed.band}}'}</code>, <code>{'{{computed.date}}'}</code>,
        <code>{' {{computed.engagement.label}}'}</code> and <code>{'{{#each computed.capabilities}}{{label}}{{/each}}'}</code> for
        facts taken from the scoring rules. Claude&rsquo;s text is always escaped.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field">
          Template (HTML)
          <textarea className="prompt-text" rows={16} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} spellCheck="false" style={{ fontFamily: 'monospace' }} />
          <span className="muted small">{text.length.toLocaleString()} / 400,000 characters</span>
          <FieldError errors={errors} name="text" />
        </label>
        <div className="editor-actions">
          <button type="submit" className="primary" disabled={saving || !text.trim()}>{saving ? 'Working…' : 'Save template'}</button>
          <button type="button" className="ghost" onClick={show} disabled={saving || !text.trim()}>Preview</button>
          <label className="ghost file-pick">
            Upload .html
            <input type="file" accept=".html,.htm,text/html" onChange={loadFile} hidden />
          </label>
          <button type="button" className="ghost" onClick={() => { setText(STARTER_TEMPLATE); setPreview(null); }}>Load starter</button>
          {template && !confirming && <button type="button" className="ghost" onClick={() => setConfirming(true)} disabled={saving}>Remove</button>}
          {template && confirming && (
            <>
              <button type="button" className="danger solid" onClick={remove} disabled={saving}>Yes, remove</button>
              <button type="button" className="ghost" onClick={() => setConfirming(false)}>Cancel</button>
            </>
          )}
          {message && <span className={message.ok ? 'saved-note' : 'error'} role="status">{message.text}</span>}
        </div>
        {template && template.updatedAt && <p className="muted small">Last changed {fmt(template.updatedAt)}{template.updatedBy ? ` by ${template.updatedBy}` : ''}</p>}
      </form>
      {preview && (
        <div>
          <details open>
            <summary>Fields Claude is asked to fill</summary>
            <pre className="llm-pre">{JSON.stringify(preview.fields, null, 2)}</pre>
          </details>
          <details open>
            <summary>Preview with placeholder text</summary>
            <iframe title="Template preview" sandbox="allow-scripts" srcDoc={preview.html} style={{ width: '100%', height: 520, border: '1px solid #d9dde3', background: '#fff' }} />
          </details>
        </div>
      )}
    </section>
  );
}

// The wrap-up skill: instructions (SKILL.md-style) sent to Claude as the system prompt when a user
// finishes the assessment; the reply becomes their guide. Paste text or load it from a .md file.
function SkillCard({
  token, org, editor, skill, onSaved,
}) {
  const [name, setName] = useState((skill && skill.name) || '');
  const [text, setText] = useState((skill && skill.text) || '');
  const [files, setFiles] = useState((skill && skill.files) || []);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState(null);
  const [message, setMessage] = useState(null);
  useEffect(() => {
    setName((skill && skill.name) || ''); setText((skill && skill.text) || ''); setFiles((skill && skill.files) || []);
  }, [skill]);

  // A zip holds SKILL.md (its instructions) plus any other text files (references, examples, templates).
  // Unzipped here in the browser; nothing is saved until Save skill.
  const loadZip = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setMessage(null);
    try {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const decoder = new TextDecoder('utf-8', { fatal: true });
      const skipped = [];
      const found = [];
      Object.keys(entries).forEach((path) => {
        if (path.endsWith('/') || /(^|\/)(__MACOSX|\.git|node_modules)\//.test(path) || /(^|\/)(\.DS_Store|\._[^/]*)$/.test(path)) return;
        if (!TEXT_FILE.test(path)) { skipped.push(path); return; }
        try { found.push({ path, text: decoder.decode(entries[path]).replace(/\r\n/g, '\n') }); } catch (err) { skipped.push(path); }
      });
      const skillFile = found
        .filter((f) => /(^|\/)skill\.md$/i.test(f.path))
        .sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
      if (!skillFile) throw new Error('The zip needs a SKILL.md file.');
      const folder = skillFile.path.replace(/[^/]*$/, ''); // zips often wrap everything in one folder
      const body = skillFile.text;
      const front = body.match(/^---\n([\s\S]*?)\n---\n?/);
      const fm = front && front[1].match(/^name:\s*(.+)$/m);
      const rest = found.filter((f) => f !== skillFile && f.path.startsWith(folder))
        .map((f) => ({ path: f.path.slice(folder.length), text: f.text }));
      setText(front ? body.slice(front[0].length).trim() : body);
      setFiles(rest);
      if (fm) setName(fm[1].trim().replace(/^["']|["']$/g, ''));
      else if (!name) setName(file.name.replace(/\.zip$/i, ''));
      setMessage({
        ok: true,
        text: `Loaded SKILL.md and ${rest.length} resource file${rest.length === 1 ? '' : 's'}${skipped.length ? `; skipped ${skipped.length} non-text file${skipped.length === 1 ? '' : 's'}` : ''}. Save to keep it.`,
      });
    } catch (err) {
      setMessage({ ok: false, text: err.message && /SKILL\.md/.test(err.message) ? err.message : 'That file could not be read as a zip.' });
    }
  };

  const loadFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const body = await file.text();
    const front = body.match(/^---\n([\s\S]*?)\n---\n?/); // SKILL.md front matter: take its name
    const fm = front && front[1].match(/^name:\s*(.+)$/m);
    setText(front ? body.slice(front[0].length) : body);
    if (fm && !name) setName(fm[1].trim());
    else if (!name) setName(file.name.replace(/\.md$/i, ''));
    e.target.value = '';
  };

  const save = async () => {
    setSaving(true); setErrors(null); setMessage(null);
    try {
      const res = await saveSkill({
        token, org, editor, skill: { name, text, files },
      });
      onSaved(res.skill);
      setMessage({ ok: true, text: 'Skill saved.' });
    } catch (e) {
      setErrors(e.errors);
      setMessage({ ok: false, text: errorText(e, 'change the skill') });
    }
    setSaving(false);
  };

  return (
    <section className="settings-card" aria-labelledby="skill-h">
      <h2 id="skill-h">Wrap-up skill</h2>
      <p className="muted small">
        Sent to Claude as the system prompt when someone chooses Finish &amp; Wrap Up. Their answers follow it, and the reply becomes their guide.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <FieldError errors={errors} name="name" />
        </label>
        <label className="field">
          Skill instructions
          <textarea className="prompt-text" rows={14} value={text} onChange={(e) => setText(e.target.value)} spellCheck="true" />
          <span className="muted small">{text.length.toLocaleString()} / 50,000 characters</span>
          <FieldError errors={errors} name="text" />
        </label>
        <div className="field">
          Resource files ({files.length})
          {files.length === 0 && <span className="muted small">None. Upload a .zip with SKILL.md and any reference files to add them.</span>}
          {files.length > 0 && (
            <ul className="skill-files">
              {files.map((f) => (
                <li key={f.path}>
                  <code>{f.path}</code>
                  <span className="muted small"> {f.text.length.toLocaleString()} characters </span>
                  <button type="button" className="ghost small" onClick={() => setFiles(files.filter((x) => x.path !== f.path))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <FieldError errors={errors} name="files" />
          <span className="muted small">Sent after the instructions, each labelled with its path.</span>
        </div>
        <div className="editor-actions">
          <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save skill'}</button>
          <label className="ghost file-pick">
            Upload .zip
            <input type="file" accept=".zip,application/zip,application/x-zip-compressed" onChange={loadZip} hidden />
          </label>
          <label className="ghost file-pick">
            Load from .md file
            <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={loadFile} hidden />
          </label>
          {message && <span className={message.ok ? 'saved-note' : 'error'} role="status">{message.text}</span>}
        </div>
        {skill && skill.updatedAt && <p className="muted small">Last changed {fmt(skill.updatedAt)}{skill.updatedBy ? ` by ${skill.updatedBy}` : ''}</p>}
      </form>
    </section>
  );
}

function PromptEditor({
  token, org, editor, prompt, onSaved, onDeleted, onClose,
}) {
  const [name, setName] = useState(prompt.name || '');
  const [text, setText] = useState(prompt.text || '');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errors, setErrors] = useState(null);
  const [message, setMessage] = useState(null);
  // reset only when a different prompt (or a new one) is opened, not when a new prompt gets its id
  useEffect(() => {
    setName(prompt.name || ''); setText(prompt.text || ''); setErrors(null); setMessage(null); setConfirming(false);
  }, [prompt.openKey]);

  const save = async () => {
    setSaving(true); setErrors(null); setMessage(null);
    try {
      const res = await savePrompt({
        token, org, editor, prompt: { promptId: prompt.promptId, name, text },
      });
      onSaved(res.prompt);
      setMessage({ ok: true, text: res.created ? 'Prompt added.' : 'Saved.' });
    } catch (e) {
      setErrors(e.errors);
      setMessage({ ok: false, text: errorText(e, 'change prompts') });
    }
    setSaving(false);
  };
  const remove = async () => {
    setSaving(true);
    try {
      await deletePrompt({ token, org, promptId: prompt.promptId });
      onDeleted(prompt.promptId);
    } catch (e) {
      setMessage({ ok: false, text: errorText(e, 'delete prompts') });
      setSaving(false);
    }
  };

  return (
    <aside className="detail question-editor" aria-label={prompt.promptId ? 'Edit prompt' : 'New prompt'}>
      <div className="detail-head">
        <h2>{prompt.promptId ? 'Edit prompt' : 'New prompt'}</h2>
        <button type="button" className="ghost" onClick={onClose}>Close</button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <FieldError errors={errors} name="name" />
        </label>
        <label className="field">
          Prompt
          <textarea className="prompt-text" rows={14} value={text} onChange={(e) => setText(e.target.value)} spellCheck="true" />
          <span className="muted small">{text.length.toLocaleString()} / 20,000 characters</span>
          <FieldError errors={errors} name="text" />
        </label>
        <div className="editor-actions">
          <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save prompt'}</button>
          <button type="button" className="ghost" onClick={onClose} disabled={saving}>Cancel</button>
          {message && <span className={message.ok ? 'saved-note' : 'error'} role="status">{message.text}</span>}
        </div>
        {prompt.promptId && (
          <div className="delete-zone">
            {!confirming ? (
              <button type="button" className="danger" onClick={() => setConfirming(true)}>Delete prompt</button>
            ) : (
              <>
                <p role="alert">Delete this prompt? This cannot be undone.</p>
                <button type="button" className="danger solid" onClick={remove} disabled={saving}>Yes, delete</button>
                <button type="button" className="ghost" onClick={() => setConfirming(false)} disabled={saving}>Cancel</button>
              </>
            )}
          </div>
        )}
        {prompt.updatedAt && <p className="muted small">Last changed {fmt(prompt.updatedAt)}{prompt.updatedBy ? ` by ${prompt.updatedBy}` : ''}</p>}
      </form>
    </aside>
  );
}

export default function SettingsPage({ token, org, profile }) {
  const [state, setState] = useState({
    loading: true, error: null, ai: null, prompts: null, skill: null, template: null,
  });
  const [editing, setEditing] = useState(null);
  const editor = profile && (profile.email || profile.name);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetchSettings({ token, org });
      setState({
        loading: false, error: null, ai: res.ai, prompts: res.prompts || [], skill: res.skill || null, template: res.template || null,
      });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e }));
    }
  }, [token, org]);
  useEffect(() => { load(); }, [load]);

  const byName = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name));
  const open = (p) => setEditing({ ...p, openKey: Date.now() });
  const onPromptSaved = (p) => {
    setState((s) => ({ ...s, prompts: byName([...s.prompts.filter((x) => x.promptId !== p.promptId), p]) }));
    setEditing((e) => ({ ...p, openKey: e.openKey }));
  };
  const onPromptDeleted = (id) => {
    setState((s) => ({ ...s, prompts: s.prompts.filter((x) => x.promptId !== id) }));
    setEditing(null);
  };

  return (
    <>
      <header className="top no-print">
        <div>
          <h1>Settings</h1>
          <p className="muted">The AI service&apos;s API key and the prompts used to send assessment results to AI.</p>
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={load} disabled={state.loading}>{state.loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </header>

      {state.error && <p role="alert" className="error">{denied(state.error) ? 'Your Adobe account is not authorized to read settings.' : `Could not load settings: ${state.error.message}`}</p>}

      {state.prompts && (
        <div className="layout">
          <div className="settings-main">
            <ApiKey token={token} org={org} editor={editor} ai={state.ai} onSaved={(ai) => setState((s) => ({ ...s, ai }))} />

            <SkillCard token={token} org={org} editor={editor} skill={state.skill} onSaved={(skill) => setState((s) => ({ ...s, skill }))} />
            <TemplateCard token={token} org={org} editor={editor} template={state.template} onSaved={(template) => setState((s) => ({ ...s, template }))} />

            <section className="settings-card" aria-labelledby="prompts-h">
              <div className="settings-card-head">
                <h2 id="prompts-h">Prompts</h2>
                <button type="button" className="primary" onClick={() => open({ name: '', text: '' })}>Add prompt</button>
              </div>
              {!state.prompts.length && <p className="muted">No prompts yet.</p>}
              <ul className="prompt-list">
                {state.prompts.map((p) => (
                  <li key={p.promptId}>
                    <button
                      type="button"
                      className={editing && editing.promptId === p.promptId ? 'prompt-row on' : 'prompt-row'}
                      onClick={() => open(p)}
                    >
                      <strong>{p.name}</strong>
                      <span className="muted small">{p.text.length > 140 ? `${p.text.slice(0, 140)}…` : p.text}</span>
                      <span className="muted small">Updated {fmt(p.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          {editing && (
            <PromptEditor
              token={token}
              org={org}
              editor={editor}
              prompt={editing}
              onSaved={onPromptSaved}
              onDeleted={onPromptDeleted}
              onClose={() => setEditing(null)}
            />
          )}
        </div>
      )}
    </>
  );
}
