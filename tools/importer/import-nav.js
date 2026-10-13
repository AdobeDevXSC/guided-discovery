/* eslint-disable */
/* global WebImporter */

/**
 * Builds the global nav fragment (/nav) from the source page header.
 * Output sections: brand (logo) | tools (CTA). Logo is served from content/images/.
 */
const LOGO_FILE = 'images/adobe-summit-logo-red.svg';

export default {
  transform: ({ document }) => {
    const header = document.querySelector('header.site, header');
    const main = document.createElement('div');

    // Section 1: brand
    const logoImg = header && header.querySelector('.logo img, img');
    if (logoImg) {
      const p = document.createElement('p');
      const img = document.createElement('img');
      img.src = LOGO_FILE;
      img.alt = logoImg.getAttribute('alt') || 'Adobe';
      p.append(img);
      main.append(p);
    }

    // Section 2: tools (CTA as primary button)
    const cta = header && header.querySelector('a.btn, a[href]');
    if (cta) {
      main.append(document.createElement('hr'));
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      const a = document.createElement('a');
      a.href = cta.getAttribute('href');
      a.textContent = cta.textContent.trim();
      strong.append(a);
      p.append(strong);
      main.append(p);
    }

    return [{
      element: main,
      path: '/nav',
      report: { title: 'nav', logo: !!logoImg, cta: cta ? cta.textContent.trim() : null },
    }];
  },
};
