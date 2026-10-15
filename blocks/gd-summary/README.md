# gd-summary block

The Guided Discovery summary and recommendation, from **DA structured content** (schema `guided-discovery-summary`, source in `tools/importer/guided-discovery/schemas/`). Put it after the `gd-section` blocks.

| Gd Summary | |
|---|---|
| Content | link to the summary document, e.g. `/forms/guided-discovery/summary` |
| Endpoint | only when no `gd-section` above it sets the endpoint |

## What authors control

- **`sections`:** the section IDs included in scoring, read from the same folder as the summary.
- **`readinessFrom`:** the question whose share of picked options is the readiness score (`data-foundations.tracked`).
- **`headlines`:** a band per `minReadiness` (0.6 / 0.25 / 0), each with its recommended next steps.
- **`sizes`:** checked in order. `maxCapabilities` (at most) and `maxReadiness` (below), combined with `match` all/any; a size without rules is the default. Seeded with the live app's thresholds: small ≤ 2 capabilities and < 34%; medium ≤ 5 or < 67%; else large.
- **`capabilities`:** labels and descriptions. Which answers unlock them is set on the section options and choices (`capabilities`) and on sliders (`upgradeFrom` + `upgradeCapabilities`).
- **`snapshot`:** rows showing an answer, a count, a choice count (e.g. gaps), an owner count or questions answered.
- **Copy:** `labels`, `contacts`, `links` (shown after submitting), `sizeNote` and `disclaimer`.

## Scoring

`scoring.js` is pure and shared: the block shows a live preview as answers change, and the `guided-discovery` action runs the same module at `complete` (and again on later edits) against the published documents, storing `result` with the session. Parity with the original catalog scoring is covered by `test/guided-discovery/summary-scoring.test.js`.

Seed content: `node tools/importer/guided-discovery/build-summary-content.js out.json`, then convert with `@adobe/da-sc-sdk` and upload to `/forms/guided-discovery/summary`.
