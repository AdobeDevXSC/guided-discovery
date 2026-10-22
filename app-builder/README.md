# App Builder backend (guided-discovery)

Adobe I/O App Builder project that backs the EDS site in this repo: actions plus an App Builder database.
Everything here is self-contained; run all commands from `app-builder/`. The folder is excluded from
EDS code sync (`.hlxignore`) and from the root lint (`.eslintignore`).

- Actions: `actions/assessments` (CJA migration assessment capture, CORS-locked to this site's `*.aem.page` / `*.aem.live`),
  `actions/items` (smoke-test endpoint), `actions/assessments-admin` (list and delete for either dataset via `?dataset=assessments|guided-discovery`;
  `require-adobe-auth: true`, so only signed-in users of this org with workspace product-profile access can call it)
- Submissions viewer: `web-src/` is a React page with two datasets, CJA migration assessment (`cja_assessments`) and
  AA to CJA Guided Discovery (`gd_sessions`, labels from `../tools/importer/guided-discovery/copy.source.json`), each with
  table, search, status filter, detail panel, delete, CSV export and print. It gets the
  signed-in user's token from Experience Cloud Shell (`@adobe/exc-app`). Open the deployed app through the Shell:
  `https://experience.adobe.com/?devMode=true#/custom-apps/?localDevUrl=<deployed index.html URL>`.
  Opened directly it shows a prompt instead of data, by design (the data is PII).
- Data model and API: [docs/cja-assessment-schema.md](docs/cja-assessment-schema.md)
- Node 20.12+ (22 recommended). Parcel plugins are pinned to 2.10.3 to match aio-cli 9.x; bump them to the
  Parcel version bundled with your aio-cli if the web build reports a version mismatch.
- `actions/guided-discovery`: autosave backend for the Guided Discovery `gd-section` / `gd-summary` EDS blocks
  (collection `assessment_responses`, see [docs/assessment-responses-schema.md](docs/assessment-responses-schema.md); ops
  `start`, `save`, `link`, `complete`, GET resume). It validates answers against the published DA structured content
  documents and scores with `../blocks/gd-summary/scoring.js` (webpack bundles it). The platform does not apply `include-ims-credentials` to it, so it also takes the `ADMIN_IMS_*`
  inputs below.
- `assessments-admin` is wrapped by the `require-adobe-auth` validator, which does not forward `include-ims-credentials`, so its
  database credentials come from `inputs` in `app.config.yaml`, read from `.env`: `ADMIN_IMS_CLIENT_ID`, `ADMIN_IMS_CLIENT_SECRET`,
  `ADMIN_IMS_ORG_ID`, `ADMIN_IMS_SCOPES` (comma-separated). They are the workspace's OAuth Server-to-Server values; set them locally
  and as CI secrets before deploying, or the action returns 500.
- `ci-templates/` holds the inactive `aio app init` workflows.
- After a fresh clone: `npm ci`, then `aio login` and `aio app use <workspace>.json` (download it from Developer Console;
  it contains secrets and is git-ignored) to recreate `.env` and `.aio`. Deploy with `aio app deploy` (add `--no-web-assets` to ship actions only).

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
