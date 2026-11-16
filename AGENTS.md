# AGENTS.md

An Adobe App Builder app in `app-builder/`. Read `app-builder/README.md` first, then `app-builder/docs/ci-cd.md` for deploys. There is no EDS site any more (the last version is at tag `eds-final`), so ignore EDS conventions.

## Layout
- `app-builder/actions/`: the web actions (`assessments`, `assessments-admin`, `guided-discovery`, `ai-analysis`, `items`). Shared code is in `actions/lib/`; scoring rules are in `actions/lib/scoring-config.json`.
- `app-builder/web-src/src/`: the React admin viewer (Experience Cloud Shell sign-in): Settings, LLM log, API reference.
- `app-builder/pages-master/guided-discovery.html`: the master of the public assessment page. This is the file the page's owner edits.
- `app-builder/web-src/self-guided.html` and `facilitator.html`: **built** from the master by `node scripts/build-pages.js`. Never edit them by hand. The facilitator page takes `?view=executive|practitioner`.
  - **These copies are for testing only.** The real pages are hosted outside App Builder, on landing.adobe.com. Whatever is deployed from here is not what users see. After a change, the built file is handed to the page's owner to upload there.
  - Because the real pages run on landing.adobe.com, the API must allow that origin (CORS), and the page reaches the API through `API_HOST_OUTSIDE_APP_BUILDER`.
- `app-builder/web-src/wrapup-guide.snippet.js`: source of the wrap-up code the build inserts into both pages (between the `app-builder wrap-up` markers).
- `app-builder/templates/`: the wrap-up deck template and its sample data. `app-builder/docs/`: data models and API formats.

## Environments and deploys
- Stage (`20409-157ochretakin-stage`) and Production (`20409-157ochretakin`) run identical code. Never hard-code a Stage or Production host. Pages follow the host serving them; `API_HOST_OUTSIDE_APP_BUILDER` (Stage by default) covers pages hosted elsewhere, such as landing.adobe.com.
- GitHub Actions deploy: every branch push deploys to Stage, and a merge to `main` deploys to Production after approval. CI uses aio CLI 10.x and runs `aio app deploy`.
- Settings (Claude key, skill, template) and questions live in each environment's database. Copy them between environments with `scripts/copy-settings.js` (add-only; use `--dry-run` first).

## Rules
- Run commands from `app-builder/`. Run `npm test` before a PR. After changing the master or `scripts/build-pages.js`, run `node scripts/build-pages.js` and commit the built pages.
- The page's dropdown values (country, primary product, industry) must match the server's lists in `actions/assessments/options.json` exactly. A value the server does not list is rejected with a 400 and the person cannot start.
- The App Builder database holds real people's data. Delete test records only by the explicit IDs you created; never filter deletes by date.
- Question and option keys are stable IDs stored with answers. Never rename or reuse them.
- The CDN in front of web actions turns a 403 into an HTML 503 page, so use 400 or 404 for refusals.
- CORS allows landing.adobe.com, localhost and the action's own host. A page opened from disk (Origin null) is rejected, so test through a local server.
- Keep the Parcel plugins in `package.json` pinned to the version the aio CLI bundles (2.16.4).
- Never commit `.env`, `.env.production`, `.aio`, the credential JSON files (`*-Production.json`, `*-Stage.json`) or `.aws.tmp.creds.json`. Stage files by explicit path, not `git add -A`.
- Wrap-up: Claude (Amazon Bedrock) returns JSON and the server fills the Handlebars template. Without a saved template, Claude's reply is used as it is.
