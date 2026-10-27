import React, { useEffect, useState } from 'react';
import { fetchProfileAnswers } from './api';
import { fmt } from './Detail';
import AiAnalyses from './AiAnalyses';

// The questions and answers behind one profile: every response (run) linked to the submission,
// each listing all questions of the bank by section, answered or not.

const words = (id) => String(id || '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

function valueText(v) {
  if (v.followUp) return `${v.optionLabel || v.option}: needs a follow-up`;
  if (v.choice) return `${v.optionLabel || v.option}: ${v.choiceLabel || v.choice}`;
  if (v.text !== undefined) return `${v.optionLabel || v.option}: ${v.text}`;
  return v.label || v.value;
}

function Run({ run, open, auth }) {
  const total = run.sections.reduce((n, s) => n + s.questions.length, 0);
  const answered = run.sections.reduce((n, s) => n + s.questions.filter((q) => q.values.length).length, 0);
  const r = run.result;
  return (
    <section className="run">
      <h4>
        <span className={`pill ${run.status}`}>{run.status.replace('_', ' ')}</span>
        {' '}Started {fmt(run.createdAt)}{run.completedAt ? ` · completed ${fmt(run.completedAt)}` : ''}
      </h4>
      <p className="muted small">
        {answered} of {total} questions answered
        {r ? ` · ${words(r.headline)} · ${words(r.engagement)} engagement · ${(r.matchedCapabilities || []).length} capabilities` : ''}
      </p>
      {run.status === 'completed' && <AiAnalyses responseId={run.responseId} auth={auth} />}
      {run.sections.map((s) => {
        const done = s.questions.filter((q) => q.values.length).length;
        return (
          <details key={s.section} className="qa-section" open={open && done > 0}>
            <summary>
              <strong>{s.title}</strong>
              <span className="muted small"> {done} / {s.questions.length}</span>
            </summary>
            <dl className="qa">
              {s.questions.map((q) => (
                <React.Fragment key={q.question}>
                  <dt>
                    {q.text || q.question}
                    <span className="muted small"> <code>{q.question}</code></span>
                  </dt>
                  <dd className={q.values.length ? '' : 'muted'}>
                    {q.values.length
                      ? (q.values.length === 1 ? valueText(q.values[0]) : <ul>{q.values.map((v) => <li key={v.value}>{valueText(v)}</li>)}</ul>)
                      : 'Not answered'}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          </details>
        );
      })}
    </section>
  );
}

export default function ProfileAnswers({
  submissionId, token, org, profile,
}) {
  const [state, setState] = useState({ loading: true, runs: [], error: null });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, runs: [], error: null });
    fetchProfileAnswers({ token, org, submissionId })
      .then((res) => { if (alive) setState({ loading: false, runs: res.runs || [], error: null }); })
      .catch((e) => { if (alive) setState({ loading: false, runs: [], error: e }); });
    return () => { alive = false; };
  }, [submissionId, token, org]);

  return (
    <>
      <h3>Questions &amp; answers</h3>
      {state.loading && <p className="muted">Loading answers…</p>}
      {state.error && <p role="alert" className="error">Could not load answers: {state.error.message}</p>}
      {!state.loading && !state.error && !state.runs.length && (
        <p className="muted">No answers linked to this profile yet. They appear once this person answers after the form hands off to the assessment.</p>
      )}
      {state.runs.map((run, i) => <Run key={run.responseId} run={run} open={i === 0} auth={{ token, org, profile }} />)}
    </>
  );
}
