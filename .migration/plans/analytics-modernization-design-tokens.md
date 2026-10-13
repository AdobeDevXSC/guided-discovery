# Analytics Modernization Readiness: Import Plan

## Overview
Bring the Adobe landing page **Analytics Modernization Readiness** (`https://landing.adobe.com/acs/analytics-modernization-readiness.html`) into this Edge Delivery Services project, which uses Document Authoring. The work happens in two phases, as requested:

1. **Design tokens:** pull the source site's colors, fonts, type sizes, spacing and button styles into the global stylesheet.
2. **Content:** analyze the page, map it to blocks, build the import tooling, and import the page so it can be checked in preview.

The header, footer and detailed block styling come after these two phases.

## Source page summary
This is a single, short marketing landing page. `#discovery` is a link that jumps down the same page, not a separate page.

| # | Section | Contents | Likely block |
|---|---------|----------|--------------|
| 1 | Header | Adobe Summit logo, `#discovery` link, "Plan your next move" button | header (nav), later phase |
| 2 | Hero | H1 "Plan Your Analytics Modernization Journey with Confidence", subheading, 2 buttons to `#discovery`, image on the right, 3 stat callouts (time, areas covered, recommendations) | `hero` variant (stats may become a `columns` row) |
| 3 | Intro | "Modernizing your analytics doesn't have to be daunting": text with an image on the left (analyst at monitors) | `columns` (image + text) |
| 4 | Features | 3 cards: "A holistic approach…", "Clarity on where you stand", "A summary to share internally", each with an image | `cards` |
| 5 | Call to action | "15 minutes can show you exactly where to focus next" with a "Start your guided assessment" button | Default content in a styled section |
| 6 | Footer | Copyright and trademark text | footer, later phase |

**Project starting point:** Standard starter blocks (`cards`, `columns`, `hero`, `fragment`, `header`, `footer`, `widget`) and the default starter stylesheet. Nothing has been imported yet.

## Phase 1: Design tokens
- Collect computed styles from the source page: brand colors, background and text colors, link and hover colors, font families and weights, heading and body sizes for desktop and mobile, spacing, button shapes and colors, and section background colors.
- Replace the starter values in the global stylesheet with tokens that match the source.
- Set up web fonts. Use the Adobe brand font if it is licensed and reachable, otherwise a close fallback. Size-adjust the fallback fonts so text doesn't shift while fonts load.
- Define section style tokens for the dark or colored backgrounds used by the hero and call-to-action sections.
- Check in preview that default text, headings and buttons look like the source.

## Phase 2: Content import
- **Page analysis:** take screenshots, clean the page HTML, mark section boundaries, decide what is default content and what is a block, and name the block variants.
- **Block mapping:** add the DOM selectors for each block variant to the page template.
- **Import tooling:**
  - Write a parser for each variant: hero, columns, cards.
  - Write transformers that strip header, footer and tracking markup, split the page into sections and set section styles.
  - Bundle these into one import script.
- **Run the import:** target page path `/acs/analytics-modernization-readiness`. Keep the `#discovery` link target and the external assessment link.
- **Check:** confirm in preview that every section, image, button and the metadata came through. Compare against the source for missing content.

## Out of scope for now / later phases
- Header migration (logo, anchor link, button).
- Footer migration (copyright and legal text).
- Visual polish for each block, plus a full-page visual comparison.
- **Linked assessment page** (`CJA-migration-assessment.html`). It is a step-by-step questionnaire on a separate page. If you want it migrated later, an optional forms add-on can convert it to an AEM form. I can turn it on whenever you want it.
- Publishing the page to Document Authoring. This needs the Adobe credentials option turned on in Settings.

## Checklist

### Phase 1: Design tokens
- [ ] Extract global design tokens from the source page: colors, typography, spacing, buttons
- [ ] Map the tokens to CSS custom properties in the global stylesheet, for desktop and mobile
- [ ] Set up brand or fallback web fonts with size-adjusted fallbacks
- [ ] Define section background styles for the hero and call-to-action sections
- [ ] Check global typography, links and buttons in preview

### Phase 2: Content import
- [ ] Analyze the page: screenshots, cleaned HTML, sections, authoring decisions
- [ ] Confirm the block variant choices: hero (with stats), columns (image + text), cards (3-up), CTA as default content
- [ ] Add block mappings (DOM selectors) to the page template
- [ ] Generate or adapt block code for any new variants
- [ ] Generate import parsers for each block variant
- [ ] Generate cleanup and section transformers
- [ ] Bundle the import script and run the import for `/acs/analytics-modernization-readiness`
- [ ] Check the imported page in preview: content complete, images load, links and anchors work, metadata present

### Next phases (after approval)
- [ ] Migrate the header and navigation
- [ ] Migrate the footer
- [ ] Style each block and run a full-page visual comparison
- [ ] Optional: turn on the forms add-on and migrate the linked assessment page
- [ ] Optional: publish to Document Authoring and preview on `main--guided-discovery--adobedevxsc.aem.page`

---
*To start Phase 1, switch to Execute mode.*
