# Assessment responses

The answers someone gives in an assessment: one document per person per assessment run, in collection `assessment_responses`.
- **Code:** `actions/guided-discovery/` (`schema.js` validates, `index.js` serves the API).
- **Profile:** the person and their initial form live in `cja_assessments` (see `cja-assessment-schema.md`). A response only references that record.

## Where the questions come from

Questions are authored in DA as structured content: one document per section (schema `guided-discovery-section`) plus a summary document (schema `guided-discovery-summary`). Each assessment has a content folder, mapped in `CONTENT` in `actions/guided-discovery/index.js`:

| Assessment | Content |
|---|---|
| `self-guided` | `/forms/guided-discovery/` (discovery, data-foundations, segmentation, identity, governance, roles, strategy-adoption, summary) |

Answers are checked against the published version of those documents. Option and question IDs are the stable keys: authors can reword labels freely, but shouldn't change or reuse an ID after launch.

## Document

```jsonc
{
  "responseId": "uuid",               // public resume token, unique; kept by the browser (localStorage gd:session)
  "schemaVersion": 2,
  "assessment": "self-guided",        // same value as the profile's assessment
  "userId": "uuid | null",            // the person (cja_users), from the linked profile
  "submissionId": "uuid | null",      // the profile record that handed off (?lead=)
  "status": "started | in_progress | completed",
  "contentVersion": "structured-content",
  "contentEnv": "live | preview",     // which published content the run started against
  "source": { "source": "", "pageUrl": "", "referrer": "", "utm": {} },
  "sections": {
    "<sectionId>": {
      "answers": { "<questionId>": ["<value>", "..."] },
      "rev": 7,                       // client revision; a save with rev <= stored is rejected (409)
      "savedAt": "ISO-8601",
      "contentHash": "16 hex chars"   // fingerprint of the published section the answers were checked against
    }
  },
  "progress": { "completed": ["<sectionId>", "..."] },
  "result": {                         // computed on the server at complete, and again on later edits
    "readinessPct": 0.75, "headline": "<headline id>", "engagement": "<size id>",
    "matchedCapabilities": [{ "id": "<capability>", "reasons": [{ "section": "", "question": "", "option": "", "choice": "", "upgrade": true }] }],
    "computedAt": "ISO-8601"
  },
  "client": { "userAgent": "" },
  "createdAt": "ISO-8601", "updatedAt": "ISO-8601", "completedAt": "ISO-8601 | null"
}
```

Indexes: `responseId` (unique), `userId + assessment`, `submissionId`, `assessment + status + createdAt`, `source.source`.

## Answer values

Each question stores a list of strings. What a value looks like depends on how the question is displayed:

| Display | Value | Example |
|---|---|---|
| cards, chips, swipe, inventory, slider | option ID | `"activation"` |
| per-item (a choice about each picked item) | `itemId:choiceId` | `"evar-product:multiple"` |
| sort (a choice about every option) | `optionId:choiceId` | `"consent:gap"` |
| owner-cards | `optionId=free text` (up to 120 characters), `optionId:follow-up` | `"analyst=Pat Lee"` |

`-single` displays and sliders take at most one value. Unknown questions, options or choices are rejected.

## API (`guided-discovery` web action)

| Call | Request | Response |
|---|---|---|
| Start | `POST {op:"start", assessment?, leadRef?, source, contentVersion, contentEnv?}` | `201 {responseId, linked}`. `assessment` defaults to `self-guided`; `leadRef` is the profile's `submissionId` |
| Link | `POST {op:"link", responseId, leadRef}` | `200 {linked}` (only if not linked yet) |
| Save | `POST {op:"save", responseId, section, rev, data:{answers}, progress?, contentEnv?}` | `200 {rev, savedAt}`, `409` if `rev` is stale, `400 {errors}` |
| Complete | `POST {op:"complete", responseId, contentEnv?}` | `200 {result}`, `503` if the content can't be fetched |
| Resume | `GET ?responseId=` | `200 {response}`: answers, revisions, progress, result. No profile data |

Clients from before the rename still work. They send `sessionId` and `sc-<sectionId>` section keys and read `sessionId` / `session`; the action accepts and returns both.

## Migration

`scripts/migrate-gd-sessions.js` copies `gd_sessions` (schema v1) into `assessment_responses`. Run it with `--write`; without it, it's a dry run. It skips responses that already exist and leaves the old collection untouched. It was run on 2026-10-22, copying 17 sessions.
