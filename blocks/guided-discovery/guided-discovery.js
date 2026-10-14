/*
 * Guided Discovery: the self-guided AA -> CJA questionnaire as one EDS block.
 *
 * Block config (2-column rows):
 *   Copy     | link to the authored copy sheet (DA multi-sheet JSON)
 *   Endpoint | App Builder guided-discovery action URL
 *
 * The visitor arrives from the CJA migration assessment form (which captures the lead) with
 * ?lead=<submissionId>; the session stores that reference. The session itself is created on the
 * first answer, then answers autosave section by section; the session id is kept in localStorage
 * so a returning visitor resumes where they left off.
 */
import { readBlockConfig } from '../../scripts/aem.js';
import { h } from './lib/dom.js';
import loadCopy from './lib/copy.js';
import { createStore, WORKFLOW } from './lib/store.js';
import createApi from './lib/api.js';
import { HUB_PAGES, PAGES, REFERENCE_PAGES } from './lib/catalog.js';
import renderOverview from './views/overview.js';
import renderDiscovery from './views/discovery.js';
import renderHub from './views/hub.js';
import renderDataFoundations from './views/data-foundations.js';
import renderSegmentation from './views/segmentation.js';
import renderIdentity from './views/identity.js';
import renderGovernance from './views/governance.js';
import renderRoles from './views/roles.js';
import renderStrategy from './views/strategy.js';
import renderSummary from './views/summary.js';
import {
  renderCrosswalk, renderArchitecture, openModal, glossaryBody, howBody,
} from './views/reference.js';

const VIEWS = {
  overview: renderOverview,
  discovery: renderDiscovery,
  hub: renderHub,
  'data-foundations': renderDataFoundations,
  segmentation: renderSegmentation,
  identity: renderIdentity,
  governance: renderGovernance,
  roles: renderRoles,
  'strategy-adoption': renderStrategy,
  summary: renderSummary,
  crosswalk: renderCrosswalk,
  architecture: renderArchitecture,
};
const ALL_PAGES = [...PAGES, ...REFERENCE_PAGES];
const HASH_PREFIX = '#gd/';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Reads ?lead=<submissionId> from the form hand-off and removes it from the address bar. */
function takeLeadParam() {
  const url = new URL(window.location.href);
  const lead = url.searchParams.get('lead');
  if (!lead) return null;
  url.searchParams.delete('lead');
  window.history.replaceState(null, '', url.href);
  return UUID_RE.test(lead) ? lead : null;
}

const sourceInfo = () => {
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
};

const configUrl = (cfg, key) => {
  const v = cfg[key];
  return Array.isArray(v) ? v[0] : v;
};

/** Wraps each glossary term's first occurrence in a view with a button opening its definition. */
function linkGlossary(root, terms, onOpen) {
  const seen = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('button, a, input, select, label, legend, h2, h3, h4, .gd-term, code, summary')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    let rest = node;
    terms.forEach((g) => {
      if (seen.has(g.id) || !rest || !rest.nodeValue) return;
      const re = new RegExp(`\\b${g.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const m = re.exec(rest.nodeValue);
      if (!m) return;
      seen.add(g.id);
      const after = rest.splitText(m.index);
      const tail = after.splitText(m[0].length);
      const btn = h('button', {
        type: 'button', class: 'gd-term', onClick: () => onOpen(g.id), text: after.nodeValue,
      });
      after.replaceWith(btn);
      rest = tail;
    });
  });
}

export default async function decorate(block) {
  const cfg = readBlockConfig(block);
  const copyUrl = configUrl(cfg, 'copy');
  const endpoint = configUrl(cfg, 'endpoint');
  block.textContent = '';
  const loading = h('p', { class: 'gd-loading', role: 'status', text: '...' });
  block.append(loading);
  if (!copyUrl || !endpoint) {
    loading.textContent = 'Guided Discovery is missing its Copy or Endpoint configuration.';
    return;
  }

  let copy;
  try {
    copy = await loadCopy(copyUrl);
  } catch (e) {
    loading.textContent = 'Guided Discovery could not load its content. Please reload the page.';
    return;
  }
  const { t } = copy;

  const saveStatus = h('span', { class: 'gd-save', role: 'status', 'aria-live': 'polite' });
  const toast = h('div', { class: 'gd-toast', role: 'alert' });
  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.add('is-on');
    setTimeout(() => toast.classList.remove('is-on'), 5000);
  };
  const statusText = {
    saving: 'save.saving', saved: 'save.saved', offline: 'save.offline', error: 'save.error',
  };

  const leadRef = takeLeadParam();
  const store = createStore();
  const api = createApi(endpoint, store, (s) => {
    saveStatus.textContent = t(statusText[s] || 'save.saved');
    saveStatus.dataset.state = s;
    if (s === 'error') showToast(t('save.error'));
  }, () => ({ leadRef, source: sourceInfo(), contentVersion: copy.contentVersion }));

  const ctx = {
    copy,
    store,
    api,
    root: block,
    page: 'overview',
    ui: {
      df: {
        step: 1, query: '', category: '', complexity: '', need: '',
      },
      showAllNeeds: false,
      crosswalkQuery: '',
    },
  };

  const view = h('div', { class: 'gd-view', id: 'gd-view', tabindex: '-1' });
  const nav = h('nav', { class: 'gd-nav', id: 'gd-nav', 'aria-label': t('nav.sections') });
  const focusPill = h('span', { class: 'gd-pill' });
  const menuBtn = h('button', {
    type: 'button', class: 'gd-menu', 'aria-label': t('topbar.menu'), 'aria-controls': 'gd-nav', 'aria-expanded': 'false',
  }, h('span', { class: 'gd-menu-icon', 'aria-hidden': 'true' }));

  const openGlossary = (termId) => openModal(ctx, t('glossary.heading'), glossaryBody(ctx, termId));

  function renderNav() {
    const { completed } = store.state.progress;
    const item = (p) => h('li', {}, h('button', {
      type: 'button',
      class: `gd-nav-link${completed.includes(p) ? ' is-done' : ''}${HUB_PAGES.includes(p) ? ' is-sub' : ''}`,
      'aria-current': ctx.page === p ? 'page' : undefined,
      onClick: () => {
        block.classList.remove('nav-open');
        menuBtn.setAttribute('aria-expanded', 'false');
        ctx.go(p);
      },
      text: t(`nav.${p}`),
    }));
    nav.replaceChildren(
      h('p', { class: 'gd-nav-label', text: t('nav.sections') }),
      h('ul', {}, PAGES.map(item)),
      h('p', { class: 'gd-nav-label', text: t('nav.reference') }),
      h('ul', {}, REFERENCE_PAGES.map(item)),
    );
    const { focus } = store.state.sections.discovery;
    focusPill.textContent = focus ? t('topbar.focusSet', { focus: copy.item('buckets', focus).name }) : t('topbar.focusUnset');
  }

  ctx.rerender = ({ keepFocus, top } = {}) => {
    let caret = null;
    if (keepFocus) {
      const el = view.querySelector(keepFocus);
      if (el) caret = el.selectionStart;
    }
    view.replaceChildren(VIEWS[ctx.page](ctx));
    linkGlossary(view, copy.list('glossary'), openGlossary);
    renderNav();
    if (keepFocus) {
      const el = view.querySelector(keepFocus);
      if (el) {
        el.focus();
        if (caret !== null && el.setSelectionRange) el.setSelectionRange(caret, caret);
      }
    }
    if (top) block.scrollIntoView({ block: 'start' });
  };

  ctx.go = (page, { fromHash = false } = {}) => {
    const target = VIEWS[page] ? page : 'overview';
    if (target !== 'data-foundations') ctx.ui.df.step = 1;
    ctx.page = target;
    store.setPage(target);
    if (!fromHash && window.location.hash !== `${HASH_PREFIX}${target}`) {
      window.history.pushState(null, '', `${HASH_PREFIX}${target}`);
    }
    ctx.rerender({ top: true });
    const heading = view.querySelector('.gd-focus-target');
    if (heading) heading.focus({ preventScroll: true });
  };

  ctx.next = (page) => {
    const idx = WORKFLOW.indexOf(page);
    const { completed } = store.state.progress;
    const nextPage = WORKFLOW.slice(idx + 1).find((p) => !completed.includes(p));
    if (nextPage) ctx.go(nextPage);
    else ctx.finish();
  };

  ctx.finish = async () => {
    try {
      const res = await api.complete();
      store.setResult(res.result);
    } catch (e) {
      showToast(t('save.error'));
    }
    ctx.go('summary');
  };

  store.subscribe((kind, detail = {}) => {
    if (kind === 'section') api.sectionChanged(detail.key);
    if (kind === 'progress') api.progressChanged();
    if (detail.render) ctx.rerender();
  });

  function mountApp() {
    menuBtn.addEventListener('click', () => {
      const open = block.classList.toggle('nav-open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    const topbar = h(
      'div',
      { class: 'gd-topbar' },
      menuBtn,
      focusPill,
      saveStatus,
      h('div', { class: 'gd-topbar-actions' }, h('button', {
        type: 'button', class: 'gd-btn gd-btn-ghost', text: t('topbar.howItWorks'), onClick: () => openModal(ctx, t('how.heading'), howBody(ctx)),
      }), h('button', {
        type: 'button', class: 'gd-btn gd-btn-ghost', text: t('topbar.glossary'), onClick: () => openGlossary(),
      })),
    );
    block.replaceChildren(topbar, h('div', { class: 'gd-layout' }, nav, view), toast, h('p', { class: 'gd-footer-note', text: t('footer.disclaimer') }));
    window.addEventListener('popstate', () => {
      const page = window.location.hash.startsWith(HASH_PREFIX) ? window.location.hash.slice(HASH_PREFIX.length) : 'overview';
      if (ALL_PAGES.includes(page) && page !== ctx.page) ctx.go(page, { fromHash: true });
    });
    const { hash } = window.location;
    const fromHash = hash.startsWith(HASH_PREFIX) ? hash.slice(HASH_PREFIX.length) : null;
    const start = [fromHash, store.state.progress.lastPage].find((p) => ALL_PAGES.includes(p)) || 'overview';
    ctx.go(start, { fromHash: Boolean(fromHash) });
  }

  if (store.state.sessionId) {
    loading.textContent = t('app.resuming');
    try {
      let session = await api.resume(store.state.sessionId);
      // a different lead than the stored session's (e.g. a shared computer): start a fresh session
      if (session && leadRef && session.leadSubmissionId && session.leadSubmissionId !== leadRef) {
        store.forget();
        session = null;
      }
      if (session) {
        store.hydrate(session);
        mountApp();
        // arriving from the form again with a lead: attach it if this session has none yet
        if (leadRef && !session.linked) api.link(leadRef).catch(() => {});
        return;
      }
      store.forget();
    } catch (e) {
      // the server is unreachable: keep the id so a later visit can resume, and start fresh now
    }
  }
  mountApp();
}
