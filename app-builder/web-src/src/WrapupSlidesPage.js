import React, { useEffect, useState } from 'react';
import { fetchLlmLogEntry } from './api';
import { fmt } from './Detail';

export const hasHtmlSlides = (entry) => (
  entry
  && entry.trigger === 'wrapup'
  && entry.status === 'done'
  && /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(entry.output || '')
);

export const wrapupSlidesUrl = (analysisId) => {
  const appUrl = new URL(window.location.href);
  appUrl.hash = '';
  appUrl.searchParams.set('guide', analysisId);
  return `https://experience.adobe.com/?devMode=true#/custom-apps/?localDevUrl=${encodeURIComponent(appUrl.toString())}`;
};

export default function WrapupSlidesPage({ token, org, analysisId }) {
  const [state, setState] = useState({ loading: true, entry: null, error: null });

  useEffect(() => {
    let active = true;
    setState({ loading: true, entry: null, error: null });
    fetchLlmLogEntry({ token, org, analysisId }).then(({ entry }) => {
      if (!active) return;
      if (entry.trigger !== 'wrapup' || entry.status !== 'done') {
        setState({ loading: false, entry: null, error: 'This wrap-up is not complete.' });
      } else if (!hasHtmlSlides(entry)) {
        setState({ loading: false, entry: null, error: 'This wrap-up does not contain saved HTML slides.' });
      } else {
        setState({ loading: false, entry, error: null });
      }
    }).catch((error) => {
      if (active) setState({ loading: false, entry: null, error: error.message });
    });
    return () => { active = false; };
  }, [token, org, analysisId]);

  if (state.loading) return <p className="muted">Loading saved slides…</p>;
  if (state.error) {
    return (
      <div>
        <p role="alert" className="error">{state.error}</p>
        <p><a className="button" href="#llm-log">Back to LLM log</a></p>
      </div>
    );
  }

  return (
    <>
      <header className="top no-print wrapup-slides-header">
        <div>
          <h1>Wrap-up slides</h1>
          <p className="muted">Saved {fmt(state.entry.createdAt)} · reference {state.entry.analysisId}</p>
        </div>
        <a className="button" href="#llm-log">Back to LLM log</a>
      </header>
      <iframe
        className="wrapup-slides-frame"
        title="Saved wrap-up slides"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={state.entry.output}
      />
    </>
  );
}
