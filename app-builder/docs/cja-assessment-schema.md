# CJA Migration Assessment: data model

Source: https://landing.adobe.com/acs/CJA-migration-assessment.html. That page is a wrapper around a Qualtrics survey
(`SV_2ukJGxddee6mfHg`) loaded in an iframe. Only the first page (profile and consent, button "Submit") is publicly
readable. The guided sections come after it and are modeled generically (see `sections`).

Collection: `cja_assessments` (one document per respondent). Code: `actions/assessments/schema.js`.
The database has no server-side validation, so the action enforces the schema.

```jsonc
{
  "_id": "<db generated>",
  "submissionId": "uuid",            // public token, unique index; returned to the frontend
  "schemaVersion": 1,
  "status": "started | in_progress | completed",
  "profile": {                       // Qualtrics QID in brackets
    "firstName": "", "lastName": "", // [QID29] [QID30]  required
    "email": "",                     // [QID36] required, valid email, stored lowercase
    "phone": "",                     // [QID39] required
    "jobTitle": "", "department": "",// [QID40] [QID41] required
    "organization": "",              // [QID42] required
    "country": "",                   // [QID43] required, enum (9 values, incl. "Other")
    "countryOther": "",              // [QID50] required only when country = "Other"
    "state": "", "postalCode": "",   // [QID44] [QID45] required
    "primaryProduct": "",            // [QID46] required, enum (40 Adobe products)
    "industry": ""                   // [QID47] required, enum (30 industries)
  },
  "consent": { "marketingContact": true, "version": "2026-adobe-marketing-v1", "acceptedAt": "ISO-8601" },
  "source": { "source": "", "pageUrl": "", "referrer": "", "utm": { "campaign": "" } },
  "client": { "userAgent": "" },     // never returned by the GET endpoint
  "sections": {                      // guided sections, keyed by section id
    "<sectionKey>": { "answers": { "<questionId>": "string | number | boolean | [string|number]" }, "savedAt": "ISO-8601" }
  },
  "summary": null,                   // free-form object stored on completion (recommendation, capabilities, size...)
  "createdAt": "ISO-8601", "updatedAt": "ISO-8601", "completedAt": "ISO-8601 | null"
}
```

Indexes: `submissionId` (unique), `profile.email`, `status + createdAt`, `source.source`.
Enum values live in `actions/assessments/options.json` (generated from the survey definition).

## Action: `POST/GET /api/v1/web/marketingprototype/assessments`

| Call | Body / query | Result |
|---|---|---|
| Create | `POST {op:"create", profile:{...}, consent:true, source:{source,pageUrl,referrer,utm}}` | `201 {submissionId}` or `400 {errors:{field:reason}}` |
| Save a section | `POST {op:"section", submissionId, section, answers:{...}}` | `200`, `404` unknown id, `409` already completed |
| Complete | `POST {op:"complete", submissionId, summary?:{...}}` | `200` or `404` |
| Fetch | `GET ?submissionId=<uuid>` | `200 {assessment}` (print, save or share the summary) |

A hidden `website` field is a honeypot: if it is non-empty the request is silently accepted and dropped.

## EDS frontend example

```js
const API = 'https://20409-157ochretakin-stage.adobeio-static.net/api/v1/web/marketingprototype/assessments';
const post = (body) => fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const p = new URLSearchParams(window.location.search);
const { submissionId } = await post({
  op: 'create', profile, consent: true,
  source: { source: p.get('source') || '', pageUrl: location.href, referrer: document.referrer,
            utm: { campaign: p.get('utm_campaign') || '' } },
});
```
