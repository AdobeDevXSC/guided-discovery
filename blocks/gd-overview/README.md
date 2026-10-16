# gd-overview block

The Guided Discovery opening screen, from **DA structured content** (schema `guided-discovery-overview`, source in `tools/importer/guided-discovery/schemas/`). Put it first on the page, above the `gd-section` blocks.

| Gd Overview | |
|---|---|
| Content | link to the overview document, e.g. `/forms/guided-discovery/overview` |
| Endpoint | App Builder `guided-discovery` action URL (the first Guided Discovery block on the page sets it) |

## What authors control

- **Header:** eyebrow, heading (rendered as the page's `h1`) and intro.
- **`benefits`:** the "Benefits of CJA" cards, each with a title, text and accent (`analysis` blue, `activation` amber, `both` purple).
- **`turnsInto` + `outputs`:** the checklist under the cards.
- **`sections`:** the section IDs and short labels tracked for progress, in page order.
- **`labels`:** the progress headings, the count and the three button labels.

## Progress card

It reads the same session as the sections (`progress.completed`, set by each section's Continue):

- **Nothing complete:** "Ready when you are" and **Start**, which scrolls to the first section and opens its guided flow.
- **Some complete:** "Your progress in this session", the count, one pill per section (✓ when complete; click to open it), a bar, and **Continue**, which opens the next unfinished section.
- **All complete:** the button goes to the summary.

Seed content: `node tools/importer/guided-discovery/build-overview-content.js out.json`, then convert with `@adobe/da-sc-sdk` and upload to `/forms/guided-discovery/overview`.
