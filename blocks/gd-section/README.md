# gd-section block

One Guided Discovery section rendered from **DA structured content**. The page itself is a normal authored page (heading, intro, any blocks); each section is a `gd-section` block pointing at a structured document, and a `gd-summary` block (see `../gd-summary/README.md`) closes the page with the recommendation.

Sections: `discovery`, `data-foundations`, `segmentation`, `identity`, `governance`, `roles`, `strategy-adoption`.

## Authoring

| Gd Section | |
|---|---|
| Content | link to the structured document, e.g. `/forms/guided-discovery/discovery` |
| Endpoint | App Builder `guided-discovery` action URL (needed on the first gd-section on the page) |

- **Questions and options:** edit them in the structured content editor. Open `/forms/guided-discovery/discovery` in DA; the `/forms` folder is mapped to the form editor via the org config `editor.path`.
- **Schema:** `guided-discovery-section`, source in `tools/importer/guided-discovery/schemas/`, stored in DA under `.da/forms/schemas/`.
- **Each question:** display (cards or chips, single or multi), required flag, optional group heading, optional "filter options by the answer to question" (by option bucket).
- **Each option:** id, label, description, caption, `note` (with the question's `noteLabel`, e.g. "CJA logic:"), `fields` (label/text rows), bucket, and the CJA capabilities it unlocks.
- **Focus:** `focusFrom` (e.g. `discovery.focus`) orders a section by the Discovery focus: options and questions whose `bucket` matches come first.
- **IDs are stable keys stored with answers.** Reword labels freely; don't change IDs after launch.
- **Publishing:** preview or publish the structured document like any page. The block reads `preview` content on `*.aem.page` and localhost, `live` content elsewhere.

## Guided flow

As in the live app (landing.adobe.com/acs/AA-to-CJA-Guided-Discovery.html), the section is fully answerable inline, and a **Start** card (`labels.startHeading` / `labels.start`) opens the guided flow over the page. The authored schema decides how it plays:

1. The **first single-choice cards question** (Discovery: focus) is a picker screen. Picking advances.
2. A **`swipe`** question is a card stack: one option at a time, drag or tap ✕ / ✓.
   - With `filterByQuestion` set, options matching that answer's bucket come first.
   - The rest are then offered with `outsideTitle` / `outsideMessage` ("A few more, outside your focus").
3. **Each `groupHeading` starts a step** shown one question per screen ("Question 1 of 4", Back / Next / Done).
   - Questions with `firstForFocus` matching the focus move to the front.
4. A **`slider`** question puts its first `sliderStops` options on a track, with an optional `gauge` (journey, clock or signal). Each stop's `caption` shows when it's picked. Remaining options (e.g. "Don't know") become chips.

5. An **`inventory`** question (Data Foundations: what you track) is a filterable, searchable card grid inline and a swipe in the guided flow.
   - Its options can carry `subLabel`, `category`, `complexity`, `tier` and a `mapping` (target, field, why, prerequisites).
   - `filterByQuestion` can point into another section, e.g. `discovery.focus`.
6. A **`per-item`** question asks its `choices` about each option picked in its `itemsFrom` question, e.g. "How many of these do you have?".
   - It shows that item's `mapping` card, inline and one item per screen in the guided flow ("CJA Mapping, Item 1 of 2").
   - Answers are saved as `itemId:choiceId`, and un-picking an item clears its per-item answer.

7. A **`sort`** question (Governance) asks its two `choices` about every option: a swipe in the guided flow (✓ = first choice, ✕ = second) and a pair of buttons per card inline. Answers are `optionId:choiceId`.
8. An **`owner-cards`** question (Roles) shows one option per screen with its `fields`, an owner text box and a follow-up checkbox. Options matching the focus come first, tagged `labels.relevantTag`. Answers are `optionId=Name` and `optionId:follow-up`.
9. **`differentFrom`** on a slider (Identity today / target) clears the other question when both would land on the same stop. **`upgradeFrom`** + `upgradeCapabilities` unlock capabilities when this answer is further along than the referenced one.

All button and hint text is in `labels` on the section. `guidedTitle` overrides a question's overlay title. When the flow ends it closes and scrolls to the section's Continue.

## Data and validation

- **Storage:** answers save through the shared assessment response (`./session.js`, with the store and autosave queue in `./lib/`) as `sections["<sectionId>"] = { answers: { questionId: [optionId] } }`, in collection `assessment_responses`. See `app-builder/docs/assessment-responses-schema.md`.
- **Validation:** the `guided-discovery` action validates them against the published structured document (unknown questions or options, more than one pick on a `-single` question, and malformed per-item, sort or owner answers are rejected).
- **Lead link:** sessions still start on the first answer and carry the `?lead=` hand-off from the assessment form.

Seed content: `build-discovery-content.js out.json`, `build-data-foundations-content.js out.json` and `build-sections-content.js <dir>` in `tools/importer/guided-discovery/`, then convert with `@adobe/da-sc-sdk` (`convertJsonToHtml`) and upload to `/forms/guided-discovery/`.
