# Deploying with GitHub Actions

| Workflow | Runs when | Deploys to |
| --- | --- | --- |
| [`deploy-stage.yml`](../../.github/workflows/deploy-stage.yml) | a push to any branch except `main` | the **Stage** workspace |
| [`deploy-prod.yml`](../../.github/workflows/deploy-prod.yml) | a push to `main` (a merged pull request) | the **Production** workspace |

Both run `npm test` first and stop if a test fails, then `aio app deploy`. Only changes under `app-builder/` (or the
workflow file itself) trigger a deploy. Every branch shares one Stage workspace, so Stage deploys queue and the branch
pushed last is what ends up there. The existing `ci.yaml` still runs the tests on pull requests.

## One-time setup

Secrets are kept in two GitHub Environments, `stage` and `production`, under the same names in each.

1. **Stage:** `node scripts/set-ci-secrets.js stage` (from `app-builder/`). It reads `.env` and `.aio`, creates the
   environment and sets all 18 secrets. Add `--dry-run` first to see what it found. Values are never printed.
2. **Production:** download the Production workspace file from the Developer Console (it must include the
   **OAuth Server-to-Server** credential and the **App Builder Data Services** API; the credential's scopes must include
   `adobeio.abdata.manage`, `.read` and `.write`, as Stage's do) and keep it in `app-builder/` (git-ignored). Create
   `.env.production` with a **new** `AI_KEY_PUBLIC` / `AI_KEY_PRIVATE` pair (the command is in the README), then run
   `node scripts/set-ci-secrets.js production --env-file .env.production --aio-file 157OchreTakin-20409-Production.json`.
3. In GitHub: Settings > Environments > `production` > add **required reviewers** if a merge should wait for approval.

### Secrets (per environment)

| Secret | From |
| --- | --- |
| `CLIENTID`, `CLIENTSECRET`, `TECHNICALACCOUNTID`, `TECHNICALACCOUNTEMAIL`, `SCOPES` | the workspace's OAuth Server-to-Server credential (comma-separated lists) |
| `IMSORGID` | the organization's IMS org id |
| `AIO_RUNTIME_NAMESPACE`, `AIO_RUNTIME_AUTH` | the workspace's Runtime namespace and its auth key |
| `AIO_PROJECT_ID`, `AIO_PROJECT_NAME`, `AIO_PROJECT_ORG_ID`, `AIO_PROJECT_WORKSPACE_ID`, `AIO_PROJECT_WORKSPACE_NAME`, `AIO_PROJECT_WORKSPACE_DETAILS_SERVICES` | the workspace file (`.aio`) |
| `ADMIN_IMS_CLIENT_SECRET`, `ADMIN_IMS_SCOPES` | read by `app.config.yaml` as the actions' database credentials |
| `AI_KEY_PUBLIC`, `AI_KEY_PRIVATE` | the key pair that encrypts and decrypts the Bedrock API key saved in Settings |

## A new workspace's database

The CI deploy does not create the App Builder database (the `database: auto-provision` setting in `app.config.yaml` is only
acted on by newer CLIs). `scripts/copy-settings.js` requests it when missing and copies the Stage settings over:
`node scripts/copy-settings.js --prod-file 157OchreTakin-20409-Production.json --provision` (add `--dry-run` first; it only
adds what is missing and never deletes; `--questions` also copies the question bank).

## What a deploy does not carry over

A new workspace has its own empty database. After the first production deploy, open the admin UI there and re-enter the
Bedrock API key, the wrap-up skill and template, and the prompts. Questions and assessment data are not copied from Stage.

Deploys use the `oauth_sts` sign-in from `adobe/aio-apps-action`; check the first run's log if Adobe changes it.

## Keep the aio CLI and the Parcel plugins in step

CI installs a fresh `aio` CLI (`10.x.x`). Its bundled Parcel version must equal the `@parcel/*` plugins pinned in
`package.json` (currently `2.16.4`), or the web-asset build fails with "Could not find module ... satisfying ...".
A CLI installed long ago on a laptop can bundle an older Parcel; reinstall it
(`npm uninstall -g @adobe/aio-cli && npm install -g @adobe/aio-cli@10`) so local deploys match CI.
CLI 9.x installed fresh also fails when uploading web assets (`identity.expiration.getTime is not a function`), which is
why the workflows use 10.
