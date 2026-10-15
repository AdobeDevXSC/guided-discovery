# gd-section block (structured content test)

One Guided Discovery section rendered from **DA structured content**. The page itself is a normal authored page (heading, intro, any blocks); each section is a `gd-section` block pointing at a structured document. Discovery is the first section built this way.

## Authoring

| Gd Section | |
|---|---|
| Content | link to the structured document, e.g. `/forms/guided-discovery/discovery` |
| Endpoint | App Builder `guided-discovery` action URL (needed on the first gd-section on the page) |

- **Questions and options:** edit them in the structured content editor. Open `/forms/guided-discovery/discovery` in DA; the `/forms` folder is mapped to the form editor via the org config `editor.path`.
- **Schema:** `guided-discovery-section`, source in `tools/importer/guided-discovery/schemas/`, stored in DA under `.da/forms/schemas/`.
- **Each question:** display (cards or chips, single or multi), required flag, optional group heading, optional "filter options by the answer to question" (by option bucket).
- **Each option:** id, label, description, caption, bucket, and the CJA capabilities it unlocks.
- **IDs are stable keys stored with answers.** Reword labels freely; don't change IDs after launch.
- **Publishing:** preview or publish the structured document like any page. The block reads `preview` content on `*.aem.page` and localhost, `live` content elsewhere.

## Data and validation

- **Storage:** answers save through the shared Guided Discovery session (`./session.js`, reusing `../guided-discovery/lib/store.js` and `api.js`) as `sections["sc-<sectionId>"] = { answers: { questionId: [optionId] } }`.
- **Validation:** the `guided-discovery` action validates them against the published structured document (unknown questions or options, and more than one pick on a `-single` question, are rejected).
- **Lead link:** sessions still start on the first answer and carry the `?lead=` hand-off from the assessment form.

Seed content: `node tools/importer/guided-discovery/build-discovery-content.js out.json`, then convert with `@adobe/da-sc-sdk` (`convertJsonToHtml`) and upload to `/forms/guided-discovery/`.
