import React, { useCallback, useEffect, useState } from 'react';
import { fetchAnalyses, fetchSettings, sendToAi } from './api';
import { fmt } from './Detail';

// Send to AI, on a completed run in the profile panel: pick a stored prompt and send the run's
// questions and answers to Claude (server to server). The analysis runs in the background; this
// polls until it finishes and lists every stored reply, newest first.

const POLL_MS = 4000;
const LABELS = {
  queued: 'Queued', running: 'Running', done: 'Done', failed: 'Failed',
};
const pending = (a) => a.status === 'queued' || a.status === 'running';

function Analysis({ a, open }) {
  return (
    <details className="ai-analysis" open={open}>
      <summary>
        <span className={`pill ai-${a.status}`}>{LABELS[a.status] || a.status}</span>
        {' '}<strong>{a.promptName}</strong>
        <span className="muted small"> · {fmt(a.createdAt)}{a.createdBy ? ` · ${a.createdBy}` : ''}</span>
      </summary>
      {pending(a) && <p className="muted small">Claude is working on it. This usually takes under a minute.</p>}
      {a.error && <p className={a.status === 'failed' ? 'error' : 'muted small'}>{a.error}</p>}
      {a.output && <div className="ai-output">{a.output}</div>}
      {a.status === 'done' && (
        <p className="muted small">
          {a.model}
          {a.usage ? ` · ${a.usage.inputTokens.toLocaleString()} in / ${a.usage.outputTokens.toLocaleString()} out tokens` : ''}
          {a.finishedAt ? ` · finished ${fmt(a.finishedAt)}` : ''}
        </p>
      )}
      <details className="ai-input">
        <summary className="muted small">What was sent</summary>
        <div className="ai-output">{a.input}</div>
      </details>
    </details>
  );
}

export default function AiAnalyses({ responseId, auth }) {
  const { token, org, profile } = auth;
  const [prompts, setPrompts] = useState(null);
  const [hasKey, setHasKey] = useState(false);
  const [promptId, setPromptId] = useState('');
  const [analyses, setAnalyses] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchSettings({ token, org })
      .then((res) => {
        if (!alive) return;
        setPrompts(res.prompts || []);
        setHasKey(Boolean(res.ai && res.ai.hasKey));
        if (res.prompts && res.prompts.length) setPromptId(res.prompts[0].promptId);
      })
      .catch((e) => { if (alive) { setPrompts([]); setError(e.message); } });
    return () => { alive = false; };
  }, [token, org]);

  const load = useCallback(async () => {
    const res = await fetchAnalyses({ token, org, responseId });
    setAnalyses(res.analyses || []);
    return res.analyses || [];
  }, [token, org, responseId]);

  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  // poll while an analysis is queued or running
  const running = analyses.some(pending);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => { load().catch(() => {}); }, POLL_MS);
    return () => clearInterval(t);
  }, [running, load]);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await sendToAi({
        token, org, responseId, promptId, editor: profile && (profile.email || profile.name),
      });
      setAnalyses((list) => [res.analysis, ...list]);
    } catch (e) {
      setError(e.message);
    }
    setSending(false);
  };

  const ready = prompts && prompts.length > 0 && hasKey;
  return (
    <div className="ai-panel">
      <div className="ai-send">
        <strong>Send to AI</strong>
        {prompts && prompts.length > 0 && (
          <select aria-label="Prompt" value={promptId} onChange={(e) => setPromptId(e.target.value)} disabled={sending}>
            {prompts.map((p) => <option key={p.promptId} value={p.promptId}>{p.name}</option>)}
          </select>
        )}
        <button type="button" className="primary" onClick={send} disabled={!ready || !promptId || sending || running}>
          {sending ? 'Sending…' : 'Send to AI'}
        </button>
      </div>
      {prompts && !ready && (
        <p className="muted small">
          {!hasKey ? 'Add the Anthropic API key' : 'Add a prompt'} on the <a href="#settings">Settings</a> page to send answers to AI.
        </p>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      {analyses.map((a, i) => <Analysis key={a.analysisId} a={a} open={i === 0} />)}
    </div>
  );
}
