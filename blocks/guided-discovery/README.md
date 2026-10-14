# guided-discovery block

Self-guided **AA → CJA Guided Discovery** questionnaire (a rebuild of
landing.adobe.com/acs/AA-to-CJA-Guided-Discovery.html). One block runs the whole flow:

- Overview (the first screen; there is no lead form here)
- Discovery and the Build Your Profile hub
- the six hub sections
- Summary & Next Steps
- Crosswalk, Architecture, Glossary and How This Works

Answers autosave to the App Builder action `app-builder/actions/guided-discovery`, which stores them in the `gd_sessions` collection.

## Authoring

Add the block to a page as a two-column table:

| Guided Discovery | |
|---|---|
| Copy | link to the copy sheet, e.g. `/acs/aa-to-cja-guided-discovery-copy.json` |
| Endpoint | `https://20409-157ochretakin-stage.adobeio-static.net/api/v1/web/marketingprototype/guided-discovery` |

The **copy sheet** is a DA multi-sheet that holds every visible string.
- **Rows:** keyed by IDs from `lib/catalog.js`. Authors edit the text columns only, never the `id` / `key` / `prompt` / `field` columns.
- **Links:** inline links use `[label](https://...)`.
- **Generating it:** run

```bash
node tools/importer/guided-discovery/build-copy-sheet.js tools/importer/guided-discovery/copy.source.json out/aa-to-cja-guided-discovery-copy.json
```

  then upload the output to DA next to the page.
- **The three summary links:** "Adobe Professional Services…", "Customer Journey Analytics overview…" and "Customer stories…" have no URLs in the copy doc yet. Add them as `[label](https://...)` in the `ui` sheet.

## Lead hand-off

The lead is captured by the CJA migration assessment form (`/acs/cja-migration-assessment`, the `form` block posting
to `assessments`). Set that form sheet's Submit row **Value** to `/acs/aa-to-cja-guided-discovery`: after a successful
submit the form redirects here with `?lead=<submissionId>`. The block strips the parameter from the address bar, and
the session stores it as `leadRef` (verified server-side against `cja_assessments`). The submissions viewer then shows
the person next to their Guided Discovery answers. Visitors who arrive without `?lead=` get an unlinked session.

## How it saves

1. The first answer POSTs `op:start` (with `leadRef` if present); just viewing the page creates nothing. The returned
   `sessionId` is kept in `localStorage` (`gd:session`). A returning visitor with a stored session and a new
   `?lead=` is linked via `op:link` (or starts fresh if the stored session belongs to a different lead).
2. Each section change POSTs `op:save {section, rev, data}`. The save is debounced by about 1 s and sent in order. A `409` means a stale revision: the block adopts the server's revision and resends.
3. When the tab is hidden, pending saves go out as `fetch(keepalive)` with a `text/plain` body, so no preflight is needed.
4. Finishing POSTs `op:complete`. The server computes the recommendation with `lib/scoring.js`, the same code the block uses.
5. On a return visit, `GET ?sessionId=` restores the answers and the last page.

`lib/catalog.js` and `lib/scoring.js` have no DOM dependencies. The App Builder action imports them, so the block and the action cannot drift apart.

## Local development

```bash
node --test test/guided-discovery/*.test.js
npx -y @adobe/aem-cli up --html-folder drafts
```

Put a test page in `drafts/` (git-excluded) with the block table, pointing `Copy` at a generated JSON in the same folder. The actions accept `http://localhost:<port>` as a CORS origin. 