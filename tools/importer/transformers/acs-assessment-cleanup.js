/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: ACS assessment (landing.adobe.com/acs/CJA-migration-assessment.html) cleanup.
 * Selectors verified in migration-work/cleaned.html:
 *   - body > div.site-nav (logo-only global header; page has no <header>) - global chrome
 *   - footer.site (copyright) - global chrome
 *   - HTML comments inside main (<!-- HERO -->, <!-- STATS -->)
 * script/style/noscript/link are generic safe removals (tracking/runtime).
 *
 * NOTE: .form-slot.formFieldSection (survey iframe container) is intentionally kept in
 * beforeTransform - the `form` parser replaces it. Leftover iframes are removed afterwards.
 */
const TransformHook = { beforeTransform: 'beforeTransform', afterTransform: 'afterTransform' };

function removeComments(root) {
  const doc = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
}

function removeGlobalChrome(element) {
  // Chrome may sit inside or outside the element passed in (main vs body)
  WebImporter.DOMUtils.remove(element, ['div.site-nav', 'footer.site']);
  const doc = element.ownerDocument || document;
  doc.querySelectorAll('body > div.site-nav, body > footer.site').forEach((el) => el.remove());
}

export default function transform(hookName, element, payload) {
  if (hookName === TransformHook.beforeTransform) {
    removeComments(element);
    // Runtime / tracking elements (do NOT remove iframe here - form parser needs .form-slot)
    WebImporter.DOMUtils.remove(element, ['script', 'style', 'noscript']);
    removeGlobalChrome(element);
  }

  if (hookName === TransformHook.afterTransform) {
    removeGlobalChrome(element);
    WebImporter.DOMUtils.remove(element, ['link', 'script', 'style', 'noscript', 'iframe']);
    removeComments(element);
  }
}
