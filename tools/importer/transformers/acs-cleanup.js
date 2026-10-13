/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: ACS (landing.adobe.com/acs) site-wide cleanup.
 * Selectors verified in migration-work/cleaned.html:
 *   - <header class="site"> (logo + "Plan your next move" CTA) - global chrome
 *   - <footer class="site"> (copyright) - global chrome
 *   - HTML comments inside main (e.g. <!-- HERO -->, commented-out markup in .collage)
 *   - section.closing a.btn (closing CTA -> primary button)
 *   - animation-only classes: reveal, is-visible, reveal-child, reveal-child-group
 * script/style/noscript/iframe/link are generic safe removals (tracking/runtime).
 */
const TransformHook = { beforeTransform: 'beforeTransform', afterTransform: 'afterTransform' };

const ANIMATION_CLASSES = ['reveal', 'is-visible', 'reveal-child', 'reveal-child-group'];

function removeComments(root) {
  const doc = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.remove());
}

export default function transform(hookName, element, payload) {
  if (hookName === TransformHook.beforeTransform) {
    // Commented-out markup (hero .collage) and section label comments
    removeComments(element);

    // Runtime / tracking elements
    WebImporter.DOMUtils.remove(element, ['script', 'style', 'noscript', 'iframe']);

    // Source declares <meta name="description"> twice; createMetadata would join both values
    const metaDoc = element.ownerDocument || document;
    const seenMeta = new Set();
    metaDoc.querySelectorAll('meta[name], meta[property]').forEach((meta) => {
      const key = `${meta.getAttribute('name') || meta.getAttribute('property')}|${meta.getAttribute('content')}`;
      if (seenMeta.has(key)) meta.remove();
      else seenMeta.add(key);
    });

    // Closing CTA: a.btn -> <p><strong><a></a></strong></p> (primary button)
    const doc = element.ownerDocument || document;
    element.querySelectorAll('section.closing a.btn').forEach((link) => {
      if (link.closest('strong')) return;
      const p = doc.createElement('p');
      const strong = doc.createElement('strong');
      link.replaceWith(p);
      link.removeAttribute('class');
      strong.append(link);
      p.append(strong);
    });
  }

  if (hookName === TransformHook.afterTransform) {
    // Global chrome (out of scope - handled by nav/footer migration)
    WebImporter.DOMUtils.remove(element, ['header.site', 'footer.site', 'link', 'script', 'style', 'noscript', 'iframe']);
    removeComments(element);

    // Animation-only classes (no effect on output, keeps markup tidy)
    element.querySelectorAll(ANIMATION_CLASSES.map((c) => `.${c}`).join(',')).forEach((el) => {
      ANIMATION_CLASSES.forEach((c) => el.classList.remove(c));
      if (!el.getAttribute('class')) el.removeAttribute('class');
    });
  }
}
