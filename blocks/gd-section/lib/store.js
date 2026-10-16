/*
 * Session state for Guided Discovery, shared by the gd-section and gd-summary blocks on a page.
 * Sections are "sc-<sectionId>": { answers } and are created on first use. Every section change
 * bumps that section's revision and notifies the autosave queue.
 */
const RESUME_KEY = 'gd:session';

const safeStorage = {
  get() { try { return window.localStorage.getItem(RESUME_KEY); } catch (e) { return null; } },
  set(v) { try { window.localStorage.setItem(RESUME_KEY, v); } catch (e) { /* private mode */ } },
  clear() { try { window.localStorage.removeItem(RESUME_KEY); } catch (e) { /* private mode */ } },
};

export default function createStore() {
  const listeners = new Set();
  const state = {
    sessionId: safeStorage.get(),
    status: null,
    sections: {},
    revs: {},
    progress: { completed: [] },
    result: null,
  };
  const emit = (kind, detail) => listeners.forEach((fn) => fn(kind, detail));

  return {
    state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /** Records the server session created lazily on the first answer; keeps answers made so far. */
    startSession(sessionId) {
      state.sessionId = sessionId;
      if (!state.status) state.status = 'in_progress';
      safeStorage.set(sessionId);
    },

    hydrate(session) {
      Object.assign(state, {
        sessionId: session.sessionId,
        status: session.status,
        sections: { ...(session.sections || {}) },
        revs: { ...(session.revs || {}) },
        progress: { completed: [], ...(session.progress || {}) },
        result: session.result || null,
      });
    },

    forget() {
      safeStorage.clear();
      state.sessionId = null;
    },

    /** Mutates one section; render:false for text inputs that must keep focus. */
    update(key, mutate, { render = true } = {}) {
      if (!state.sections[key]) state.sections[key] = { answers: {} };
      mutate(state.sections[key]);
      state.revs[key] = (state.revs[key] || 0) + 1;
      if (state.status === 'started') state.status = 'in_progress';
      emit('section', { key, render });
    },

    /** Moves the local revision past the server's after a 409. */
    adoptServerRev(key, rev) {
      if ((state.revs[key] || 0) <= rev) state.revs[key] = rev + 1;
    },

    markComplete(page) {
      if (!state.progress.completed.includes(page)) state.progress.completed.push(page);
      emit('progress', { render: true });
    },

    setResult(result, status = 'completed') {
      state.result = result;
      state.status = status;
      emit('result', { render: true });
    },
  };
}
