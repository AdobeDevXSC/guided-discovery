/* eslint-disable */
/* global WebImporter */

/**
 * Builds the global footer fragment (/footer) from the source page footer.
 * Each source paragraph becomes a paragraph; <br> line breaks are kept.
 */
export default {
  transform: ({ document }) => {
    const footer = document.querySelector('footer.site, footer');
    const main = document.createElement('div');

    if (footer) {
      // inline scripts (e.g. document.write of the year) are not content
      footer.querySelectorAll('script, noscript, style').forEach((el) => el.remove());

      footer.querySelectorAll('p').forEach((srcP) => {
        const p = document.createElement('p');
        // split on <br>, normalise whitespace in each line
        const lines = srcP.innerHTML
          .split(/<br\s*\/?>/i)
          .map((html) => {
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            return tmp.textContent.replace(/\s+/g, ' ').trim();
          })
          .filter(Boolean);
        lines.forEach((line, i) => {
          if (i > 0) p.append(document.createElement('br'));
          p.append(document.createTextNode(line));
        });
        if (lines.length) main.append(p);
      });
    }

    return [{
      element: main,
      path: '/footer',
      report: { title: 'footer', paragraphs: main.querySelectorAll('p').length },
    }];
  },
};
