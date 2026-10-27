import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchSettings, saveAiSettings, savePrompt, deletePrompt,
} from './api';
import { fmt } from './Detail';

// Settings: the AI connection used to send assessment results to an AI service (client ID and
// client secret) and the prompts stored for it. The client secret is write-only: the server keeps
// it encrypted and only reports whether one is saved and its last four characters.

const denied = (e) => e && (e.status === 401 || e.status === 403);
const errorText = (e, what) => (denied(e) ? `Your Adobe account is not authorized to ${what}.` : e.message);

function FieldError({ errors, name }) {
  const msg = errors && errors[name];
  return msg ? <span className="field-error" role="alert">{msg}</span> : null;
}

function AiConnection({
  token, org, editor, ai, onSaved,
}) {
  const [clientId, setClientId] = useState(ai.clientId);
  const [secret, setSecret] = useState('');
  const [replacing, setReplacing] = useState(!ai.hasSecret);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState(null);
  const [message, setMessage] = useState(null);
  useEffect(() => { setClientId(ai.clientId); setReplacing(!ai.hasSecret); setSecret(''); }, [ai]);

  const save = async (extra = {}) => {
    setSaving(true); setErrors(null); setMessage(null);
    try {
      const res = await saveAiSettings({
        token, org, editor, ai: { clientId, clientSecret: replacing ? secret : '', ...extra },
      });
      onSaved(res.ai);
      setMessage({ ok: true, text: extra.clearSecret ? 'Client secret removed.' : 'Saved.' });
    } catch (e) {
      setErrors(e.errors);
      setMessage({ ok: false, text: errorText(e, 'change settings') });
    }
    setSaving(false);
  };

  return (
    <section className="settings-card" aria-labelledby="ai-h">
      <h2 id="ai-h">AI connection</h2>
      <p className="muted small">The credentials used to send assessment results to the AI service.</p>
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field">
          Client ID
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck="false" />
          <FieldError errors={errors} name="clientId" />
        </label>
        <div className="field">
          <span>Client secret</span>
          {ai.hasSecret && !replacing ? (
            <div className="secret-saved">
              <span>
                Saved
                <span className="muted"> · ends in </span>
                <code>{`••••${ai.secretHint}`}</code>
              </span>
              <button type="button" className="ghost" onClick={() => setReplacing(true)}>Replace</button>
              <button type="button" className="ghost danger-text" onClick={() => save({ clearSecret: true })} disabled={saving}>Remove</button>
            </div>
          ) : (
            <>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete="new-password"
                placeholder={ai.hasSecret ? 'New client secret' : 'Client secret'}
                aria-label="Client secret"
              />
              <span className="muted small">Stored encrypted. It isn&apos;t shown again after saving.</span>
              {ai.hasSecret && <button type="button" className="ghost inline" onClick={() => { setReplacing(false); setSecret(''); }}>Keep the saved secret</button>}
            </>
          )}
          <FieldError errors={errors} name="clientSecret" />
        </div>
        <div className="editor-actions">
          <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save connection'}</button>
          {message && <span className={message.ok ? 'saved-note' : 'error'} role="status">{message.text}</span>}
        </div>
        {ai.updatedAt && <p className="muted small">Last changed {fmt(ai.updatedAt)}{ai.updatedBy ? ` by ${ai.updatedBy}` : ''}</p>}
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
  const [state, setState] = useState({ loading: true, error: null, ai: null, prompts: [] });
  const [editing, setEditing] = useState(null);
  const editor = profile && (profile.email || profile.name);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetchSettings({ token, org });
      setState({
        loading: false, error: null, ai: res.ai, prompts: res.prompts || [],
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
          <p className="muted">The AI connection and the prompts used to send assessment results to AI.</p>
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={load} disabled={state.loading}>{state.loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </header>

      {state.error && <p role="alert" className="error">{denied(state.error) ? 'Your Adobe account is not authorized to read settings.' : `Could not load settings: ${state.error.message}`}</p>}

      {state.ai && (
        <div className="layout">
          <div className="settings-main">
            <AiConnection token={token} org={org} editor={editor} ai={state.ai} onSaved={(ai) => setState((s) => ({ ...s, ai }))} />

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
