# Guided Discovery app (Adobe App Builder)

The AA to CJA Guided Discovery assessment: a public assessment page, the APIs it saves to, and an admin viewer, all on Adobe App Builder with the App Builder database. Run every command from this folder.

**Stage:** project `marketingprototype`, workspace Stage, org `adobe-lamont-crook`.

| Piece | Where |
|---|---|
| Public assessment page | `web-src/self-guided.html`, served at https://20409-157ochretakin-stage.adobeio-static.net/self-guided.html (no sign-in) |
| Admin viewer (profiles, questions, API reference) | `web-src/src/`, opened through Experience Cloud: `https://experience.adobe.com/?devMode=true#/custom-apps/?localDevUrl=https://20409-157ochretakin-stage.adobeio-static.net/index.html` |
| Profiles API | `actions/assessments`: the assessment's initial form (`cja_assessments`, people in `cja_users`) |
| Responses API | `actions/guided-discovery`: answers, progress and results (`assessment_responses`), plus `GET ?op=questions` |
| Admin API | `actions/assessments-admin`: lists, deletes, the question bank, exports; needs an Adobe IMS token (`require-adobe-auth`) |
| Question bank | `assessment_questions`, edited on the viewer's Questions page (`actions/lib/questions.js`) |
| Scoring rules | `actions/lib/scoring-config.json`, used by `actions/lib/scoring.js` |
| Settings (AI API key, prompts) | the viewer's Settings page: `app_settings` and `ai_prompts`, via `actions/lib/settings.js`. The API key is stored encrypted and never returned |

Docs:
- [docs/cja-assessment-schema.md](docs/cja-assessment-schema.md): profiles
- [docs/assessment-responses-schema.md](docs/assessment-responses-schema.md): responses, questions, scoring and answer formats
- The viewer's **API reference** page: every operation, with curl and fetch examples

## Working on it

- **The public page** is one self-contained HTML file: its own page code, plus an "App Builder sync" block at the end that talks to the APIs. The build publishes it because `web-src/index.html` links to it.
- **Tests:** `npm test` (Jest) covers scoring and answer validation against a fixture of the real questions (`test/fixtures/self-guided-questions.json`). Re-export the fixture when the question bank changes.
- **Deploy:** `aio app deploy` (actions and web), or `--no-web-assets` / `--no-actions` for one half. Deploying is manual; merging doesn't deploy.
- **Allowed browser origins** are in `actions/lib/cors.js`: `landing.adobe.com`, this app's static host, localhost and 127.0.0.1. Calls without an `Origin` header (curl, servers) are accepted.
- **AI API key (Anthropic):** entered on the Settings page and stored on the server, in `app_settings`, encrypted with RSA-OAEP. `AI_KEY_PUBLIC` in `.env` goes to `assessments-admin`, which can encrypt a new key but can't read a saved one. `AI_KEY_PRIVATE` is for the action that calls Claude, server to server, and only that action should receive it. Keep both values, and the same across deploys: with a new pair, the saved API key can't be read and must be re-entered. Without `AI_KEY_PUBLIC` the page refuses to save a key. To generate a pair (base64 DER, one line each): `node -e "const {publicKey:p,privateKey:k}=require('crypto').generateKeyPairSync('rsa',{modulusLength:3072});console.log('AI_KEY_PUBLIC='+p.export({type:'spki',format:'der'}).toString('base64')+'\nAI_KEY_PRIVATE='+k.export({type:'pkcs8',format:'der'}).toString('base64'))"`. Use an API key made for this app, in its own Anthropic workspace with a spending limit.
- **Admin credentials:** `assessments-admin` (wrapped by `require-adobe-auth`) and `guided-discovery` read their database credentials from `inputs` in `app.config.yaml`, which come from `.env`: `ADMIN_IMS_CLIENT_ID`, `ADMIN_IMS_CLIENT_SECRET`, `ADMIN_IMS_ORG_ID`, `ADMIN_IMS_SCOPES` (comma-separated). These are the workspace's OAuth Server-to-Server values.
- **Maintenance scripts** in `scripts/` use the same `.env`: `backfill-user-ids.js` and `migrate-gd-sessions.js`. Both default to a dry run; add `--write` to apply.
- **After a fresh clone:** `npm ci`, `aio login`, then `aio app use <workspace>.json` (download it from Developer Console; it holds secrets and is git-ignored) to recreate `.env` and `.aio`.
- **Node:** 20.12+ (22 recommended). Parcel plugins are pinned to 2.10.3 to match aio-cli 9.x.
- **Leftover scaffold:** `actions/items` is a scaffold endpoint from the App Builder template.

## Original generated notes

Welcome to my Adobe I/O Application!

## Setup

- Populate the `.env` file in the project root and fill it as shown [below](#env)

## Local Dev

- `aio app run` to start your local Dev server
- App will run on `localhost:9080` by default

By default the UI will be served locally but actions will be deployed and served from Adobe I/O Runtime. To start a
local serverless stack and also run your actions locally use the `aio app run --local` option.

## Test & Coverage

- Run `aio app test` to run unit tests for ui and actions
- Run `aio app test --e2e` to run e2e tests

## Deploy & Cleanup

- `aio app deploy` to build and deploy all actions on Runtime and static files to CDN
- `aio app undeploy` to undeploy the app

## Config

### `.env`

You can generate this file using the command `aio app use`. 

```bash
# This file must **not** be committed to source control

## please provide your Adobe I/O Runtime credentials
# AIO_RUNTIME_AUTH=
# AIO_RUNTIME_NAMESPACE=
```

### `app.config.yaml`

- Main configuration file that defines an application's implementation. 
- More information on this file, application configuration, and extension configuration 
  can be found [here](https://developer.adobe.com/app-builder/docs/guides/appbuilder-configuration/#appconfigyaml)

#### Action Dependencies

- You have two options to resolve your actions' dependencies:

  1. **Packaged action file**: Add your action's dependencies to the root
   `package.json` and install them using `npm install`. Then set the `function`
   field in `app.config.yaml` to point to the **entry file** of your action
   folder. We will use `webpack` to package your code and dependencies into a
   single minified js file. The action will then be deployed as a single file.
   Use this method if you want to reduce the size of your actions.

  2. **Zipped action folder**: In the folder containing the action code add a
     `package.json` with the action's dependencies. Then set the `function`
     field in `app.config.yaml` to point to the **folder** of that action. We will
     install the required dependencies within that directory and zip the folder
     before deploying it as a zipped action. Use this method if you want to keep
     your action's dependencies separated.

## Debugging in VS Code

While running your local server (`aio app run`), both UI and actions can be debugged, to do so open the vscode debugger
and select the debugging configuration called `WebAndActions`.
Alternatively, there are also debug configs for only UI and each separate action.

## Typescript support for UI

To use typescript use `.tsx` extension for react components and add a `tsconfig.json` 
and make sure you have the below config added
```
 {
  "compilerOptions": {
      "jsx": "react"
    }
  } 
```
