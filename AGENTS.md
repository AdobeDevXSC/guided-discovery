# AGENTS.md

An Adobe App Builder app in `app-builder/`. Read `app-builder/README.md` first. There is no EDS site any more (the last version is at tag `eds-final`), so ignore EDS conventions.

## Layout
- `app-builder/web-src/self-guided.html`: the public assessment page, one self-contained file. Keep it that way. Its page code is the developer's; the API sync is the block at the end.
- `app-builder/web-src/src/`: the React admin viewer (Experience Cloud Shell sign-in).
- `app-builder/actions/`: the web actions. Shared code is in `actions/lib/`, and scoring rules in `actions/lib/scoring-config.json`.
- `app-builder/docs/`: data models and API formats.

## Rules
- Run commands from `app-builder/`. Run `npm test` before a PR.
- Deploying is manual (`aio app deploy`); merging `main` deploys nothing. Stage serves whatever was deployed last.
- The App Builder database holds real people's data. Delete test records only by the explicit IDs you created; never filter deletes by date.
- Question and option keys are stable IDs stored with answers. Never rename or reuse them.
- The CDN in front of web actions turns a 403 into an HTML 503 page, so use 400 or 404 for refusals.
