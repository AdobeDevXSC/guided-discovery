/*
 * One Guided Discovery session shared by every gd-section block on the page.
 * Built on the store and autosave queue in ./lib: the session is created on the
 * first answer (carrying ?lead=<submissionId> from the assessment form) and resumed from
 * localStorage on return visits.
 */
import createStore from './lib/store.js';
import createApi from './lib/api.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTENT_VERSION = 'structured-content';

/** Structured content is read from preview on aem.page and localhost, from live elsewhere. */
export const contentEnv = () => {
  const host = window.location.hostname;
  return host.endsWith('.aem.page') || host === 'localhost' ? 'preview' : 'live';
};

/** Reads ?lead=<submissionId> from the form hand-off and removes it from the address bar. */
function takeLeadParam() {
  const url = new URL(window.location.href);
  const lead = url.searchParams.get('lead');
  if (!lead) return null;
  url.searchParams.delete('lead');
  window.history.replaceState(null, '', url.href);
  return UUID_RE.test(lead) ? lead : null;
}

function sourceInfo() {
  const q = new URLSearchParams(window.location.search);
  const utm = {};
  ['source', 'medium', 'campaign', 'term', 'content'].forEach((k) => {
    if (q.get(`utm_${k}`)) utm[k] = q.get(`utm_${k}`);
  });
  return {
    source: (q.get('source') || `aem-eds:${window.location.pathname}`).slice(0, 100),
    pageUrl: window.location.href.split('#')[0],
    referrer: document.referrer,
    utm,
  };
}

let session = null;

/**
 * Returns the page's shared { store, api, ready, onStatus }. The first block to call it sets the
 * endpoint; `ready` resolves once a stored session has been resumed (or found absent).
 */
export default function getSession(endpoint) {
  if (session) return session;
  if (!endpoint) return null;
  const leadRef = takeLeadParam();
  const statusListeners = new Set();
  const store = createStore();
  const api = createApi(
    endpoint,
    store,
    (s, err) => statusListeners.forEach((fn) => fn(s, err)),
    () => ({ leadRef, source: sourceInfo(), contentVersion: CONTENT_VERSION }),
    () => ({ contentEnv: contentEnv() }),
  );
  store.subscribe((kind, detail = {}) => {
    if (kind === 'section') api.sectionChanged(detail.key);
    if (kind === 'progress') api.progressChanged();
  });

  const ready = (async () => {
    if (!store.state.responseId) return;
    try {
      let resumed = await api.resume(store.state.responseId);
      // a different lead than the stored session's (e.g. a shared computer): start fresh
      if (resumed && leadRef && resumed.leadSubmissionId && resumed.leadSubmissionId !== leadRef) {
        store.forget();
        resumed = null;
      }
      if (resumed) {
        store.hydrate(resumed);
        if (leadRef && !resumed.linked) api.link(leadRef).catch(() => {});
      } else {
        store.forget();
      }
    } catch (e) {
      // server unreachable: keep the id for a later visit; answers start empty for now
    }
  })();

  session = {
    store, api, ready, onStatus: (fn) => statusListeners.add(fn),
  };
  return session;
}
