/*
 * Session state for the Guided Discovery. Sections hold catalog IDs only (the server's shape).
 * Every section change bumps that section's revision and notifies the autosave queue.
 */
import { computeResult } from './scoring.js';

const RESUME_KEY = 'gd:session';

export const WORKFLOW = [
  'discovery', 'data-foundations', 'segmentation', 'identity', 'governance', 'roles', 'strategy-adoption',
];

/** Page id -> section key stored on the server. */
export const SECTION_OF = {
  discovery: 'discovery',
  'data-foundations': 'dataFoundations',
  segmentation: 'segmentation',
  identity: 'identity',
  governance: 'governance',
  roles: 'roles',
  'strategy-adoption': 'strategyAdoption',
};

const emptySections = () => ({
  discovery: { focus: null, needs: [], answers: {} },
  dataFoundations: { selected: [], quantity: {}, dataView: [] },
  segmentation: { prioritized: [] },
  identity: { current: null, target: null },
  governance: { status: {} },
  roles: { owners: {}, followUp: [] },
  strategyAdoption: { answers: {}, aiCapabilityPicks: [] },
  inventoryReview: { added: [] },
});

const safeStorage = {
  get() { try { return window.localStorage.getItem(RESUME_KEY); } catch (e) { return null; } },
  set(v) { try { window.localStorage.setItem(RESUME_KEY, v); } catch (e) { /* private mode */ } },
  clear() { try { window.localStorage.removeItem(RESUME_KEY); } catch (e) { /* private mode */ } },
};

export function createStore() {
  const listeners = new Set();
  const state = {
    sessionId: safeStorage.get(),
    status: null,
    sections: emptySections(),
    revs: {},
    progress: { completed: [], lastPage: null },
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
      const base = emptySections();
      Object.entries(session.sections || {}).forEach(([k, v]) => {
        base[k] = { ...base[k], ...v };
      });
      Object.assign(state, {
        sessionId: session.sessionId,
        status: session.status,
        sections: base,
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
      mutate(state.sections[key]);
      state.revs[key] = (state.revs[key] || 0) + 1;
      if (state.status === 'started') state.status = 'in_progress';
      emit('section', { key, render });
    },

    /** Moves the local revision past the server's after a 409. */
    adoptServerRev(key, rev) {
      if ((state.revs[key] || 0) <= rev) state.revs[key] = rev + 1;
    },

    setPage(page) {
      if (state.progress.lastPage === page) return;
      state.progress.lastPage = page;
      emit('progress', { render: false });
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

    /** Local preview of the recommendation; the server's result is authoritative once completed. */
    preview() {
      return state.result || computeResult(state.sections);
    },

    completedCount() {
      return WORKFLOW.filter((p) => state.progress.completed.includes(p)).length;
    },
  };
}
