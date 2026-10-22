/*
 * Async posts to the App Builder guided-discovery action. Saves are debounced per section and
 * sent one at a time in order; a stale revision (409) adopts the server's rev and resends, and
 * network/5xx failures retry with backoff. On tab hide, pending changes go out as keepalive
 * requests with a text/plain body (CORS-safelisted, so no preflight is needed).
 */
const DEBOUNCE_MS = 1000;
const RETRIES = [1000, 3000, 8000, 15000];

class HttpError extends Error {
  constructor(status, body) {
    super((body && body.error) || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

/**
 * startInfo() returns the {leadRef, source, contentVersion} used to create the session lazily:
 * the first answer starts it, so merely viewing the page never creates a record.
 */
export default function createApi(
  endpoint,
  store,
  onStatus = () => {},
  startInfo = () => ({}),
  saveExtra = () => ({}),
) {
  const dirty = new Set();
  let progressDirty = false;
  let timer = null;
  let chain = Promise.resolve();
  let failures = 0;

  async function request(method, body, query = '') {
    const res = await fetch(`${endpoint}${query}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* non-JSON error page */ }
    if (!res.ok) throw new HttpError(res.status, json);
    return json;
  }

  const retryable = (e) => !(e instanceof HttpError) || e.status >= 500;
  const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

  function payloadFor(key) {
    const { state } = store;
    return {
      op: 'save',
      responseId: state.responseId,
      section: key,
      rev: state.revs[key] || 1,
      data: state.sections[key],
      ...saveExtra(),
    };
  }

  async function sendOne(body) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await request('POST', body);
      } catch (e) {
        if (e instanceof HttpError && e.status === 409 && body.section) {
          store.adoptServerRev(body.section, e.body && e.body.rev ? e.body.rev : body.rev);
          return request('POST', payloadFor(body.section));
        }
        if (!retryable(e) || attempt >= RETRIES.length) throw e;
        onStatus(navigator.onLine === false ? 'offline' : 'saving');
        // eslint-disable-next-line no-await-in-loop
        await wait(RETRIES[attempt]);
      }
    }
  }

  async function ensureSession() {
    if (store.state.responseId) return;
    const res = await request('POST', { op: 'start', ...startInfo() });
    store.startSession(res.responseId);
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    // navigation alone (progress) never creates a session; the first answer does
    if (!store.state.responseId && !dirty.size) return chain;
    if (!dirty.size && !progressDirty) return chain;
    const keys = [...dirty];
    dirty.clear();
    const withProgress = progressDirty;
    progressDirty = false;
    onStatus('saving');
    chain = chain.then(async () => {
      try {
        await ensureSession();
        const bodies = keys.map(payloadFor);
        if (withProgress) {
          if (bodies.length) bodies[0].progress = store.state.progress;
          else bodies.push({ op: 'save', responseId: store.state.responseId, progress: store.state.progress });
        }
        // eslint-disable-next-line no-restricted-syntax
        for (const body of bodies) {
          // eslint-disable-next-line no-await-in-loop
          await sendOne(body);
        }
        failures = 0;
        onStatus(dirty.size || progressDirty ? 'saving' : 'saved');
      } catch (e) {
        failures += 1;
        keys.forEach((k) => dirty.add(k));
        if (withProgress) progressDirty = true;
        onStatus(navigator.onLine === false ? 'offline' : 'error', e);
        if (failures < 5) timer = setTimeout(flush, DEBOUNCE_MS * 5);
      }
    });
    return chain;
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  }

  // last-chance save when the tab is hidden or closed
  function beacon() {
    if (!store.state.responseId || (!dirty.size && !progressDirty)) return;
    const bodies = [...dirty].map(payloadFor);
    if (progressDirty) {
      if (bodies.length) bodies[0].progress = store.state.progress;
      else bodies.push({ op: 'save', responseId: store.state.responseId, progress: store.state.progress });
    }
    bodies.forEach((body) => {
      fetch(endpoint, {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body),
      }).catch(() => {});
    });
    dirty.clear();
    progressDirty = false;
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') beacon(); });
  window.addEventListener('pagehide', beacon);
  window.addEventListener('online', () => { failures = 0; flush(); });

  return {
    sectionChanged(key) { dirty.add(key); schedule(); },
    progressChanged() { progressDirty = true; schedule(); },
    flush,

    /** Links an existing session to a CJA assessment lead (no-op if already linked). */
    async link(leadRef) {
      if (!store.state.responseId || !leadRef) return null;
      return request('POST', { op: 'link', responseId: store.state.responseId, leadRef });
    },

    async complete() {
      await flush();
      await ensureSession();
      return request('POST', { op: 'complete', responseId: store.state.responseId, ...saveExtra() });
    },

    async resume(responseId) {
      try {
        return (await request('GET', null, `?responseId=${encodeURIComponent(responseId)}`)).response;
      } catch (e) {
        if (e instanceof HttpError && (e.status === 404 || e.status === 400)) return null;
        throw e;
      }
    },
  };
}
