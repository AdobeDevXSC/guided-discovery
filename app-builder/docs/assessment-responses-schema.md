# Assessment responses

The answers someone gives in an assessment: one document per person per assessment run, in collection `assessment_responses`.
- **Code:** `actions/guided-discovery/` (`schema.js` validates, `index.js` serves the API).
- **Profile:** the person and their initial form live in `cja_assessments` (see `cja-assessment-schema.md`). A response only references that record.

## Where the questions come from

Questions live in the **question bank**, collection `assessment_questions`. There's one document per question, in `actions/lib/questions.js`: `{ assessment, questionId, section, sectionTitle, sectionOrder, order, title, help, display, required, options:[{id, label, ...}], choices?, itemsFrom?, ..., createdAt, updatedAt, updatedBy }`.
- **Editing:** the admin viewer's Questions page (admin op `question-save`). Keys are fixed once saved; saved options can be relabelled but not removed, and the answer type can't change.
- **Reading:** `GET ?op=questions` on this action (public).
- **Origin:** the bank was seeded on 2026-10-22 from the original section documents (23 questions). The seed script is in git history at tag `eds-final`.

## Scoring rules

Each assessment's scoring rules live in `actions/lib/scoring-config.json`, keyed by assessment ID. An assessment exists when it has an entry there. The rules are:
- **`sections`:** the sections scored, in order.
- **`readinessFrom`:** the question whose share of picked options is the readiness score (`data-foundations.tracked`).
- **`headlines`:** a band per `minReadiness`, with recommended next steps.
- **`sizes`:** engagement sizes, checked in order with `maxCapabilities` and `maxReadiness`.
- **`capabilities`:** labels and descriptions.

Change the rules through a PR. `test/scoring.test.js` checks them against the real questions (`test/fixtures/self-guided-questions.json`).

Answers are checked against the bank. Option and question IDs are the stable keys: authors can reword labels freely, but shouldn't change or reuse an ID after launch.

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
  "source": { "source": "", "pageUrl": "", "referrer": "", "utm": {} },
  "sections": {
    "<sectionId>": {
      "answers": { "<questionId>": ["<value>", "..."] },
      "rev": 7,                       // client revision; a save with rev <= stored is rejected (409)
      "savedAt": "ISO-8601",
      "contentHash": "16 hex chars"   // fingerprint of the bank section the answers were checked against
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
| text (free text) | the text, up to 500 characters | `"We migrate in Q3"` |
| per-item (a choice about each picked item) | `itemId:choiceId` | `"evar-product:multiple"` |
| sort (a choice about every option) | `optionId:choiceId` | `"consent:gap"` |
| owner-cards | `optionId=free text` (up to 120 characters), `optionId:follow-up` | `"analyst=Pat Lee"` |

`-single` displays and sliders take at most one value. Unknown questions, options or choices are rejected.

## API (`guided-discovery` web action)

| Call | Request | Response |
|---|---|---|
| Start | `POST {op:"start", assessment?, leadRef?, source, contentVersion}` | `201 {responseId, linked}`. `assessment` defaults to `self-guided`; `leadRef` is the profile's `submissionId` |
| Link | `POST {op:"link", responseId, leadRef}` | `200 {linked}` (only if not linked yet) |
| Save | `POST {op:"save", responseId, section, rev, data:{answers}, progress?}` | `200 {rev, savedAt}`, `409` if `rev` is stale, `400 {errors}` |
| Answer | `POST {op:"answer", responseId, userId?, section, question, value}` or `POST {op:"answer", responseId, userId?, answers:[{section, question, value}, …]}` | `200 {userId, saved:[{section, question}], revs:{section: rev}, savedAt}`, `400 {errors}`, `400` if the response isn't linked to a user, `404` (also when `userId` isn't the response's) |
| Complete | `POST {op:"complete", responseId}` | `200 {result}` |
| Questions | `GET ?op=questions&assessment=` | `200 {sections:[{section, title, questions:[{question, text, help?, type, display, required, options:[{key, label}], choices?, itemsFrom?}]}]}` |
| Answers for a person | `GET ?op=answers&userId=&responseId=&assessment=?` | `200 {userId, count, responses:[{assessment, status, sections:[{section, title, answers:[{question, text, values:[{value, label…}]}]}], result, …}]}`. `responseId` must be one of that person's responses (otherwise `404`); only that one is echoed back |
| Resume | `GET ?responseId=` | `200 {response}`: answers, revisions, progress, result. No profile data |

### Answering individual questions

`answer` is for callers that post as they go, outside the page's own autosave: a front end on another site, or an integration.

- **Linked responses only.** `answer` only stores answers it can attribute to a person: the response must have a `userId`, so start it with `leadRef` or link it with `op:"link"` first. Otherwise it returns `400 {error:"response is not linked to a user", hint}` and stores nothing. `save` (the page's autosave) still works for unlinked visitors.
- **Optional `userId` check.** Send `userId` to make sure you're writing to that person's response. It must be a UUID (otherwise `400 {error:"invalid userId"}`) and match the response's `userId`; if it doesn't, the reply is `404 not found`, so it doesn't reveal whose response it is. The success reply always includes the response's `userId`.
- **One answer or several.** Send one answer at the top level, or up to 50 in `answers`, across any sections.
- **Merges, doesn't replace.** Each answer sets one question and keeps the section's other answers. `save` replaces the whole section.
- **Values:** `value` is a string or an array of strings, in the formats above. `null` or `[]` clears the question.
- **All or nothing.** Every answer is checked against the published questions first. If any is invalid, nothing is stored and the response lists each error.
- **No revisions to track.** The server bumps each touched section's `rev`. Editing a completed response recalculates `result`.
- **One writer per section.** If the page has the same response open, its next autosave of that section sees the newer revision, then re-sends its own copy of the whole section. Answers posted through `answer` for that section are then overwritten. Use one writer per section at a time.

```bash
curl -X POST "$ENDPOINT" -H 'Content-Type: application/json' -d '{
  "op": "answer", "responseId": "<responseId>", "userId": "<userId>",
  "answers": [
    { "section": "discovery", "question": "focus", "value": "activation" },
    { "section": "identity", "question": "identity-target", "value": "unified-graph" },
    { "section": "governance", "question": "status", "value": ["consent:gap", "data-labels:in-place"] }
  ]
}'
```

Clients from before the rename still work. They send `sessionId` and `sc-<sectionId>` section keys and read `sessionId` / `session`; the action accepts and returns both.

## Migration

`scripts/migrate-gd-sessions.js` copies `gd_sessions` (schema v1) into `assessment_responses`. Run it with `--write`; without it, it's a dry run. It skips responses that already exist and leaves the old collection untouched. It was run on 2026-10-22, copying 17 sessions.
