/* ---- wrap-up guide (Finish & Wrap Up): the guide is written by Claude, not simulated ----
   Source of truth for the block that goes at the END of the App Builder sync IIFE in the page
   (just before its closing `})();`), because it uses that block's private state, api and save.
   Copy it into the master HTML so the facilitator pages are rebuilt with it.

   Flow: save answers -> POST /guided-discovery {op:'wrapup-send'}: the server completes the
   response, sends the answers and profile (no contact details) to Claude with the wrap-up skill from
   Settings, and returns an analysisId -> poll GET ?op=wrapup-status until done or failed. The reply
   (Markdown) becomes the downloadable guide behind the "Your guide is ready" card. Without a
   connected response (state.responseId) the page's original simulated behaviour is kept. */
{
  const priorGenerate = window.generateModernizationGuide;
  const POLL_MS = 4000;
  const GIVE_UP_MS = 11 * 60 * 1000; // a little over the 10 minute action timeout
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  window.WRAPUP_GUIDE = { text: '', analysisId: '' };

  // Download guide: an HTML deck opens in a new tab to print as PDF; anything else downloads as before
  const priorDownload = window.downloadModernizationGuide;
  window.downloadModernizationGuide = function downloadModernizationGuide() {
    if (window.WRAPUP_GUIDE.printable && MODERNIZATION_GUIDE.status === 'ready' && MODERNIZATION_GUIDE.downloadUrl) {
      if (!window.open(MODERNIZATION_GUIDE.downloadUrl, '_blank')) showToast('Allow pop-ups for this page to save your guide as a PDF.');
      return undefined;
    }
    return priorDownload.apply(this, arguments);
  };

  // Elapsed time and a short reference key under the card text, so people can see it is working and
  // quote the key to support; the key is the first 8 characters of the query's id in the LLM log.
  const meta = { start: 0, key: '', timer: null };
  const clock = (ms) => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  function paintMeta() {
    let el = document.getElementById('mg-wrapup-meta');
    if (!el) {
      const copy = document.getElementById('mg-status-copy');
      if (!copy) return;
      el = document.createElement('p');
      el.id = 'mg-wrapup-meta';
      el.className = 'mg-status-copy';
      el.style.cssText = 'margin-top:10px;font-size:13px;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.6)';
      copy.insertAdjacentElement('afterend', el);
    }
    el.textContent = (meta.timer ? 'Elapsed ' : 'Took ') + clock(Date.now() - meta.start) + (meta.key ? ' \u00b7 Reference: ' + meta.key : '');
  }
  function startMeta() {
    clearInterval(meta.timer);
    meta.start = Date.now();
    meta.key = '';
    meta.timer = setInterval(paintMeta, 1000);
    paintMeta();
  }
  function stopMeta() {
    clearInterval(meta.timer);
    meta.timer = null;
    paintMeta();
  }

  window.generateModernizationGuide = async function generateModernizationGuide() {
    if (!state.responseId) return priorGenerate.apply(this, arguments);
    if (MODERNIZATION_GUIDE.status === 'generating' || MODERNIZATION_GUIDE.status === 'ready') return undefined;
    MODERNIZATION_GUIDE.status = 'generating';
    MODERNIZATION_GUIDE.error = '';
    renderModernizationGuidePage();
    startMeta();
    try {
      await save();
      const sent = await api('/guided-discovery', 'POST', { op: 'wrapup-send', responseId: state.responseId, retry: !!window.WRAPUP_TEST_RERUN });
      state.completed = true;
      meta.key = String(sent.analysisId || '').slice(0, 8);
      paintMeta();
      const started = Date.now();
      let res;
      for (;;) {
        res = await api('/guided-discovery?op=wrapup-status&responseId=' + encodeURIComponent(state.responseId)
          + '&analysisId=' + encodeURIComponent(sent.analysisId));
        if (res.status === 'done' || res.status === 'failed') break;
        if (Date.now() - started > GIVE_UP_MS) throw new Error('The guide is taking longer than expected. Please try again.');
        await sleep(POLL_MS);
      }
      if (res.status === 'failed') throw new Error('We could not write your guide right now. Please try again.');
      if (!res.output) throw new Error('The guide came back empty. Please try again.');
      window.WRAPUP_GUIDE = { text: res.output, analysisId: sent.analysisId, printable: false };
      // the server typesets the reply as a PDF; if that fails the Markdown is still downloadable
      // a skill can ask for a finished HTML document (e.g. a slide deck); that is delivered as .html, not typeset
      const isHtml = /^\s*(```(html)?\s*)?(<!doctype html|<html[\s>])/i.test(res.output);
      let pdf = '';
      if (!isHtml) try {
        const typeset = await api('/guided-discovery?op=wrapup-status&format=pdf&responseId=' + encodeURIComponent(state.responseId)
          + '&analysisId=' + encodeURIComponent(sent.analysisId));
        pdf = typeset.pdf || '';
      } catch (pdfErr) { console.error('Wrap-up guide PDF error:', pdfErr); }
      if (MODERNIZATION_GUIDE.downloadUrl && MODERNIZATION_GUIDE.downloadUrl.startsWith('blob:')) URL.revokeObjectURL(MODERNIZATION_GUIDE.downloadUrl);
      const base = CONFIG.client.name.replace(/\s+/g, '-') + '-Analytics-Modernization-Guide';
      if (isHtml) {
        // an HTML deck is saved as a PDF by the browser: Download guide opens it in a new tab and starts the
        // print dialog (Save as PDF); the deck's own styles and its Save as PDF button do the rest
        const title = base.replace(/[<>&"]/g, '');
        const printable = res.output
          .replace(/^\s*```(html)?[ \t]*\n/i, '') // a reply saved before fences were removed
          .replace(/(<\/html>)[\s\S]*$/i, '$1') // drop any commentary after the document
          .replace(/<title>[\s\S]*?<\/title>/i, '<title>' + title + '</title>')
          .replace(/<\/body>/i, '<script>addEventListener("load",function(){setTimeout(function(){print()},800)})<\/script></body>');
        MODERNIZATION_GUIDE.downloadUrl = URL.createObjectURL(new Blob([printable], { type: 'text/html' }));
        MODERNIZATION_GUIDE.fileName = base + '.pdf';
        MODERNIZATION_GUIDE.fileType = 'application/pdf';
        window.WRAPUP_GUIDE.printable = true;
      } else if (pdf) {
        const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
        MODERNIZATION_GUIDE.downloadUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        MODERNIZATION_GUIDE.fileName = base + '.pdf';
        MODERNIZATION_GUIDE.fileType = 'application/pdf';
      } else {
        MODERNIZATION_GUIDE.downloadUrl = URL.createObjectURL(new Blob([res.output], { type: 'text/markdown' }));
        MODERNIZATION_GUIDE.fileName = base + '.md';
        MODERNIZATION_GUIDE.fileType = 'text/markdown';
      }
      MODERNIZATION_GUIDE.status = 'ready';
    } catch (err) {
      MODERNIZATION_GUIDE.status = 'error';
      // server errors carry HTTP details; show people a plain message and keep the detail in the console
      MODERNIZATION_GUIDE.error = err instanceof Error && !err.status ? err.message
        : err && err.status === 429 ? 'This guide has been requested several times already. Please contact your Adobe team.'
          : 'We could not prepare your guide right now. Please try again.';
      // on the test link, show what the server said
      if (window.WRAPUP_TEST_RERUN && err && err.message) MODERNIZATION_GUIDE.error += ' [' + String(err.message).slice(0, 200) + ']';
      console.error('Wrap-up guide error:', err);
    }
    stopMeta();
    renderModernizationGuidePage();
    if (window.CURRENT_PAGE_ID === 'onepager') renderOnePager();
    return undefined;
  };
}

/* ---- test hook: ?wrapupTest=<responseId> opens straight onto the last step for an existing,
   completed response (see scripts/seed-wrapup-test.js), skipping the contact form and every
   section, and runs the real wrap-up for it. Remove before the page goes to real users. ---- */
{
  const testId = new URLSearchParams(window.location.search).get('wrapupTest');
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(testId || '')) {
    state.responseId = testId;
    window.WRAPUP_TEST_RERUN = true; // test link: always send a fresh query, not the finished one
    state.completed = true;
    GATE_PASSED = true;
    const gate = document.getElementById('gate-screen');
    if (gate) gate.classList.remove('open');
    CONFIG.client.name = 'Test organization';
    if (typeof applyConfig === 'function') applyConfig();
    setTimeout(() => window.beginFinalization(), 300);
  }
}
