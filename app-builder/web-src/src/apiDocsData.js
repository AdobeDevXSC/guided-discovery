// Content for the API reference page (ApiDocs.js). Plain data: edit here, not in the component.
// Source of truth is the action code under app-builder/actions/; keep this in step with it.
//
// Shapes:
//   section: { id, title, action, intro: [text], notes?: [text], ops: [op], placeholder?: bool }
//   op:      { id, title, method, summary, fields?: [[name, type, required, notes]], fieldsLabel?,
//              success: { status, body }, errors: [{ status, when, body }], curl, fetch, notes?: [text] }
// Text strings may contain `code` spans (backticks), rendered as <code>.

export const BASE_URL = 'https://20409-157ochretakin-stage.adobeio-static.net/api/v1/web/marketingprototype';

const json = (v) => JSON.stringify(v, null, 2);
const indent = (s, n) => s.split('\n').map((l, i) => (i ? ' '.repeat(n) + l : l)).join('\n');

// curl / fetch examples are generated from the same request so the two never drift apart.
const curlPost = (action, body, extraHeaders = []) => [
  `curl -X POST "$BASE/${action}" \\`,
  ...extraHeaders.map((h) => `  -H "${h}" \\`),
  "  -H 'Content-Type: application/json' \\",
  `  -d '${json(body)}'`,
].join('\n');

const curlGet = (action, query, extraHeaders = []) => [
  `curl "$BASE/${action}?${query}"${extraHeaders.length ? ' \\' : ''}`,
  ...extraHeaders.map((h, i) => `  -H "${h}"${i < extraHeaders.length - 1 ? ' \\' : ''}`),
].join('\n');

const fetchPost = (action, body, extraHeaders = '') => [
  `const res = await fetch(BASE + '/${action}', {`,
  "  method: 'POST',",
  `  headers: { ${extraHeaders}'Content-Type': 'application/json' },`,
  `  body: JSON.stringify(${indent(json(body), 2)}),`,
  '});',
  'const data = await res.json(); // { ok: true, ... } or { ok: false, error | errors }',
].join('\n');

const fetchGet = (action, query, extraHeaders = '') => [
  `const res = await fetch(BASE + '/${action}?${query}'${extraHeaders ? `, {\n  headers: { ${extraHeaders} },\n}` : ''});`,
  'const data = await res.json();',
].join('\n');

const fetchGetExpr = (urlExpr) => `const res = await fetch(${urlExpr});\nconst data = await res.json();`;

const ADMIN_CURL_HEADERS = ['Authorization: Bearer $IMS_TOKEN', 'x-gw-ims-org-id: $IMS_ORG'];
const ADMIN_FETCH_HEADERS = "Authorization: 'Bearer ' + token, 'x-gw-ims-org-id': imsOrg";

// ---------- sample values (valid against options.json and the published questions) ----------

const PROFILE = {
  firstName: 'Jordan',
  lastName: 'Rivera',
  email: 'jordan.rivera@example.com',
  phone: '+1 555 0100',
  jobTitle: 'Analytics Lead',
  department: 'Marketing',
  organization: 'Example Retail Co',
  country: 'United States',
  state: 'California',
  postalCode: '94105',
  primaryProduct: 'Customer Journey Analytics',
  industry: 'Retail',
};
const SOURCE = {
  source: 'aem-eds:/acs/cja-assessment',
  pageUrl: 'https://main--guided-discovery--adobedevxsc.aem.live/acs/cja-assessment',
  referrer: '',
  utm: { campaign: 'cja-migration' },
};
const NOW = '2026-10-22T18:30:00.000Z';
const RESULT = {
  readinessPct: 0.75,
  headline: '<headline id>',
  engagement: '<size id>',
  matchedCapabilities: [{
    id: 'graph-stitching',
    reasons: [{ section: 'identity', question: 'identity-target', option: 'unified-graph', upgrade: true }],
  }],
  computedAt: NOW,
};

// ---------- overview ----------

export const OVERVIEW = {
  intro: [
    'Three App Builder web actions back the assessment: `assessments` stores the person (the profile and consent form), `guided-discovery` stores their answers, and `assessments-admin` is the authenticated read and delete API used by this viewer.',
    'Every action takes and returns JSON. POST bodies are JSON objects with an `op` field that picks the operation; GET calls take query parameters.',
  ],
  auth: [
    '`assessments` and `guided-discovery` are public. They are gated by unguessable IDs instead: a random `submissionId` (profile) or `responseId` (answers) handed back on create/start. Anyone holding the ID can read and update that record, so treat it like a password.',
    '`assessments-admin` requires an Adobe IMS user access token from this project\'s org, sent as `Authorization: Bearer <token>` and `x-gw-ims-org-id: <org id>`. The App Builder gateway rejects requests without a valid token before the action runs.',
    'Public actions have a hidden honeypot field, `website`. Any request where it is non-empty gets `200 {"ok": true}` and is dropped without storing anything.',
  ],
  cors: {
    intro: 'The public actions accept browser calls only from these origins:',
    origins: [
      '`https://<branch>--guided-discovery--adobedevxsc.aem.page` and `.aem.live` (EDS preview and live)',
      '`https://landing.adobe.com`',
      '`http://localhost:<port>` (local `aem up`)',
      '`http://127.0.0.1:<port>` (local `aem up`)',
    ],
    rules: [
      'A request with an allowed `Origin` gets `Access-Control-Allow-Origin` echoed back. Allowed methods are GET, POST and OPTIONS; the only allowed request header is `Content-Type`. Preflight answers are cached for 600 seconds.',
      'A request with any other `Origin` gets `400 {"ok": false, "error": "origin not allowed"}`, and a preflight from it gets an empty `400`. (The action does not return 403, because the CDN rewrites 403 into 503.)',
      'Requests without an `Origin` header (curl, server-to-server) are not browser traffic and pass through. CORS does not protect against them.',
      '`assessments-admin` has no CORS handling; it is called from this viewer and authorized by the IMS token.',
    ],
  },
  errors: [
    'Every response body has `ok`. A failure is `{"ok": false, "error": "<message>"}` for a single problem, or `{"ok": false, "errors": {"<field>": "<reason>"}}` for validation errors, with one entry per bad field.',
  ],
  errorExample: json({ ok: false, errors: { email: 'invalid email', country: 'not an allowed value', consent: 'consent required' } }),
  statuses: [
    ['200', 'OK. Read, update, or a no-op (honeypot).'],
    ['201', 'Created: a new profile (`create`) or response (`start`).'],
    ['204', 'Preflight (OPTIONS) from an allowed origin.'],
    ['400', 'Bad request: invalid op, ID, field or value, or a disallowed origin. Check `error` / `errors`.'],
    ['401', 'Admin only: missing or invalid IMS token (returned by the gateway, not the action).'],
    ['404', 'No record with that ID.'],
    ['405', 'Method other than GET or POST.'],
    ['409', 'Conflict: the profile is already completed (`section`), or a section save used a stale `rev`.'],
    ['500', '`{"error": "internal error"}`: database or platform failure. Safe to retry.'],
    ['503', 'Responses `complete` only: the published questions could not be fetched to score the result. Retry.'],
  ],
  setup: 'BASE=' + BASE_URL,
  setupFetch: "const BASE = '" + BASE_URL + "';",
};

// ---------- profile API ----------

const PROFILE_FIELDS_ROWS = [
  ['firstName', 'string', 'yes', 'Up to 100 characters.'],
  ['lastName', 'string', 'yes', 'Up to 100 characters.'],
  ['email', 'string', 'yes', 'Valid email, up to 254 characters. Stored lowercase; identifies the person (`userId`).'],
  ['phone', 'string', 'yes', 'Digits, spaces and `+ ( ) - .`, 5 to 30 characters.'],
  ['jobTitle', 'string', 'yes', 'Up to 150 characters.'],
  ['department', 'string', 'yes', 'Up to 150 characters.'],
  ['organization', 'string', 'yes', 'Up to 200 characters.'],
  ['country', 'enum', 'yes', 'One of `options.json` countries, e.g. `United States`, or `Other`.'],
  ['countryOther', 'string', 'if country is Other', 'Up to 100 characters.'],
  ['state', 'string', 'yes', 'Up to 100 characters.'],
  ['postalCode', 'string', 'yes', 'Up to 20 characters.'],
  ['primaryProduct', 'enum', 'yes', 'One of 40 Adobe products in `options.json`, e.g. `Customer Journey Analytics`.'],
  ['industry', 'enum', 'yes', 'One of 30 industries in `options.json`, e.g. `Retail`.'],
];

const createBody = { op: 'create', profile: PROFILE, consent: true, source: SOURCE };
const sectionBody = {
  op: 'section',
  submissionId: '<submissionId>',
  section: 'migration-goals',
  answers: { 'top-goal': 'faster-insights', 'report-suites': 3, 'has-sdk': true, channels: ['web', 'app'] },
};
const completeProfileBody = { op: 'complete', submissionId: '<submissionId>', summary: { readinessPct: 0.75, engagement: '<size id>' } };

const profileApi = {
  id: 'profiles',
  title: 'Profiles API',
  action: 'assessments',
  intro: [
    'The person and their consent, captured by the assessment\'s first form. Collection `cja_assessments`, one document per submission. Each submission also gets the person\'s `userId`, which is the same for every submission with the same email (collection `cja_users`).',
    'Use the returned `submissionId` as `leadRef` when you start a response, so the answers are linked to this profile.',
  ],
  ops: [
    {
      id: 'profiles-create',
      title: 'Create a profile',
      method: 'POST',
      summary: '`op: "create"`. Validates the profile and consent and creates a submission with status `started`.',
      fields: [
        ['op', '"create"', 'yes', ''],
        ['profile', 'object', 'yes', 'The fields in the next table.'],
        ['consent', 'boolean', 'yes', 'Must be `true` (marketing contact consent). Anything else fails with `errors.consent`.'],
        ['assessment', 'string', 'no', 'Which assessment. Defaults to `self-guided`, currently the only value; unknown values fail with `errors.assessment`.'],
        ['source', 'object | string', 'no', '`{ source, pageUrl, referrer, utm: { source, medium, campaign, term, content } }`. A plain string is taken as `source.source`. `source.source` must match `[\\w.:/\\- ]{0,100}` or it is stored empty; other values are truncated (500 / 100 characters).'],
        ['website', 'string', 'no', 'Honeypot. Leave it out.'],
      ],
      extraTables: [{ label: 'profile fields', rows: PROFILE_FIELDS_ROWS }],
      success: { status: 201, body: json({ ok: true, submissionId: '<submissionId>', userId: '<userId>' }) },
      errors: [
        { status: 400, when: 'Validation failed (one entry per field)', body: json({ ok: false, errors: { phone: 'required', industry: 'not an allowed value', consent: 'consent required' } }) },
        { status: 400, when: 'Unknown op', body: json({ ok: false, error: 'op must be create, section or complete' }) },
      ],
      curl: curlPost('assessments', createBody),
      fetch: fetchPost('assessments', createBody),
      notes: ['Field values are trimmed. Field errors read `required`, `max N chars`, `not an allowed value`, `invalid email` or `invalid phone number`.'],
    },
    {
      id: 'profiles-section',
      title: 'Save a profile section',
      method: 'POST',
      summary: '`op: "section"`. Stores (replaces) one free-form section of answers on the profile and sets status `in_progress`. Guided Discovery answers use the Responses API instead; this is for extra profile-level sections.',
      fields: [
        ['op', '"section"', 'yes', ''],
        ['submissionId', 'uuid', 'yes', 'From create.'],
        ['section', 'string', 'yes', 'Section key: letters, digits, `_` and `-`, up to 64 characters, starting with a letter or digit.'],
        ['answers', 'object', 'yes', '`{ questionId: value }`, up to 200 entries. Question IDs follow the section key rule. A value is a string (up to 5000 characters), number, boolean, `null`, or an array of up to 100 strings/numbers.'],
      ],
      success: { status: 200, body: json({ ok: true }) },
      errors: [
        { status: 400, when: 'Bad or missing submissionId', body: json({ ok: false, error: 'invalid submissionId' }) },
        { status: 400, when: 'Bad section key or value', body: json({ ok: false, errors: { section: 'invalid section key', 'answers.channels': 'invalid value' } }) },
        { status: 404, when: 'No such submission', body: json({ ok: false, error: 'not found' }) },
        { status: 409, when: 'The profile is already completed', body: json({ ok: false, error: 'already completed' }) },
      ],
      curl: curlPost('assessments', sectionBody),
      fetch: fetchPost('assessments', sectionBody),
    },
    {
      id: 'profiles-complete',
      title: 'Complete a profile',
      method: 'POST',
      summary: '`op: "complete"`. Sets status `completed` and stores an optional summary.',
      fields: [
        ['op', '"complete"', 'yes', ''],
        ['submissionId', 'uuid', 'yes', ''],
        ['summary', 'object', 'no', 'Free-form (recommendation, capabilities, size...). Stored as `null` if missing, not an object, or 50,000+ characters as JSON.'],
      ],
      success: { status: 200, body: json({ ok: true }) },
      errors: [
        { status: 400, when: 'Bad or missing submissionId', body: json({ ok: false, error: 'invalid submissionId' }) },
        { status: 404, when: 'No such submission', body: json({ ok: false, error: 'not found' }) },
      ],
      curl: curlPost('assessments', completeProfileBody),
      fetch: fetchPost('assessments', completeProfileBody),
      notes: ['Calling it again on a completed profile succeeds and overwrites `summary` and `completedAt`.'],
    },
    {
      id: 'profiles-get',
      title: 'Fetch a profile',
      method: 'GET',
      summary: '`?submissionId=<uuid>`. Returns the stored submission, including the profile, without the internal `_id` and `client` fields.',
      fieldsLabel: 'Query parameters',
      fields: [['submissionId', 'uuid', 'yes', '']],
      success: {
        status: 200,
        body: json({
          ok: true,
          assessment: {
            submissionId: '<submissionId>', userId: '<userId>', assessment: 'self-guided', schemaVersion: 1, status: 'started',
            profile: { firstName: 'Jordan', lastName: 'Rivera', email: 'jordan.rivera@example.com', '...': '...' },
            consent: { marketingContact: true, version: '2026-adobe-marketing-v1', acceptedAt: NOW },
            source: { source: 'aem-eds:/acs/cja-assessment', pageUrl: '...', referrer: '', utm: { campaign: 'cja-migration' } },
            sections: {}, summary: null, createdAt: NOW, updatedAt: NOW, completedAt: null,
          },
        }),
      },
      errors: [
        { status: 400, when: 'Bad or missing submissionId', body: json({ ok: false, error: 'invalid submissionId' }) },
        { status: 404, when: 'No such submission', body: json({ ok: false, error: 'not found' }) },
      ],
      curl: curlGet('assessments', 'submissionId=<submissionId>'),
      fetch: fetchGetExpr("BASE + '/assessments?submissionId=' + encodeURIComponent(submissionId)"),
      notes: ['The response contains personal data. Anyone with the `submissionId` can read it.'],
    },
  ],
};

// ---------- responses API ----------

const startBody = {
  op: 'start', assessment: 'self-guided', leadRef: '<submissionId>', source: SOURCE, contentVersion: 'structured-content',
};
const linkBody = { op: 'link', responseId: '<responseId>', leadRef: '<submissionId>' };
const answerOne = {
  op: 'answer', responseId: '<responseId>', section: 'discovery', question: 'focus', value: 'activation',
};
const answerBatch = {
  op: 'answer',
  responseId: '<responseId>',
  userId: '<userId>',
  answers: [
    { section: 'identity', question: 'identity-current', value: 'deterministic-login' },
    { section: 'identity', question: 'identity-target', value: 'unified-graph' },
    { section: 'governance', question: 'status', value: ['consent:gap', 'data-labels:in-place'] },
  ],
};
const answerClear = { op: 'answer', responseId: '<responseId>', section: 'discovery', question: 'focus', value: null };
const saveBody = {
  op: 'save',
  responseId: '<responseId>',
  section: 'identity',
  rev: 3,
  data: { answers: { 'identity-current': ['deterministic-login'], 'identity-target': ['unified-graph'] } },
  progress: { completed: ['discovery', 'identity'] },
};
const completeBody = { op: 'complete', responseId: '<responseId>' };

const responsesApi = {
  id: 'responses',
  title: 'Responses API',
  action: 'guided-discovery',
  intro: [
    'The person\'s answers to an assessment run. Collection `assessment_responses`, one document per run. A response stores only a reference to the profile (`submissionId` and `userId`), never the profile itself.',
    'Answers are checked against the questions published in DA structured content for that assessment (`self-guided`: sections discovery, data-foundations, segmentation, identity, governance, roles, strategy-adoption). Every answer value is an array of strings; see Answer value formats.',
    'Responses carry `Cache-Control: no-store`. A POST may also be sent as `text/plain` (for example `navigator.sendBeacon` on tab close); the body is still parsed as JSON.',
  ],
  notes: [
    'Deprecated aliases from before the rename still work: `sessionId` is accepted wherever `responseId` is, and returned next to it by `start`; section keys may carry an `sc-` prefix (`sc-identity`); resume also returns a `session` copy with `sc-` keys. New clients should use `responseId`, plain section IDs and `response`.',
  ],
  ops: [
    {
      id: 'responses-start',
      title: 'Start a response',
      method: 'POST',
      summary: '`op: "start"`. Creates a response with status `started` and returns its `responseId`. Pass the profile\'s `submissionId` as `leadRef` to link them.',
      fields: [
        ['op', '"start"', 'yes', ''],
        ['assessment', 'string', 'no', 'Defaults to `self-guided`. Unknown values fail with `errors.assessment`.'],
        ['leadRef', 'uuid | { submissionId }', 'no', 'The profile\'s `submissionId`. Linked only if that profile exists and belongs to the same assessment; otherwise the response starts unlinked (`linked: false`, no error).'],
        ['source', 'object | string', 'no', 'Same shape and cleaning as the profile `source`.'],
        ['contentVersion', 'string', 'no', 'Free-form label for the content the client rendered, up to 40 characters.'],
        ['contentEnv', '"live" | "preview"', 'no', 'Which published questions to validate and score against. Anything but `preview` means `live`.'],
      ],
      success: { status: 201, body: json({ ok: true, responseId: '<responseId>', sessionId: '<responseId>', linked: true }) },
      errors: [
        { status: 400, when: 'Unknown assessment', body: json({ ok: false, errors: { assessment: 'unknown assessment' } }) },
        { status: 400, when: 'Unknown op', body: json({ ok: false, error: 'op must be start, save, answer, link or complete' }) },
      ],
      curl: curlPost('guided-discovery', startBody),
      fetch: fetchPost('guided-discovery', startBody),
    },
    {
      id: 'responses-link',
      title: 'Link a profile',
      method: 'POST',
      summary: '`op: "link"`. Attaches a profile to a response that was started without one. A response that is already linked keeps its profile.',
      fields: [
        ['op', '"link"', 'yes', ''],
        ['responseId', 'uuid', 'yes', ''],
        ['leadRef', 'uuid | { submissionId }', 'yes', 'The profile\'s `submissionId`.'],
      ],
      success: { status: 200, body: json({ ok: true, linked: true, changed: true }) },
      errors: [
        { status: 200, when: 'Already linked (nothing changed)', body: json({ ok: true, linked: true, changed: false }) },
        { status: 200, when: 'leadRef missing, invalid or not found', body: json({ ok: true, linked: false }) },
        { status: 400, when: 'Bad or missing responseId', body: json({ ok: false, error: 'invalid responseId' }) },
        { status: 404, when: 'No such response', body: json({ ok: false, error: 'not found' }) },
      ],
      curl: curlPost('guided-discovery', linkBody),
      fetch: fetchPost('guided-discovery', linkBody),
    },
    {
      id: 'responses-answer',
      title: 'Answer questions',
      method: 'POST',
      summary: '`op: "answer"`. Sets one question, or a batch of up to 50 across any sections. Each answer replaces that question only and keeps the section\'s other answers. Use this when you post as you go, from another front end or an integration. Only responses linked to a user take answers: start the response with `leadRef`, or link it, first.',
      fields: [
        ['op', '"answer"', 'yes', ''],
        ['responseId', 'uuid', 'yes', 'Must be linked to a user (started with `leadRef`, or linked with `op: "link"`).'],
        ['userId', 'uuid', 'no', 'The person you expect the response to belong to. If sent, it must match the response\'s `userId`; otherwise the reply is `404`.'],
        ['section', 'string', 'single', 'Section ID, e.g. `discovery`. Not `summary` or `overview`.'],
        ['question', 'string', 'single', 'Question ID, e.g. `focus`: lowercase letters, digits and `-`, up to 64 characters.'],
        ['value', 'string | string[] | null', 'single', 'In the format for that question\'s display. `null`, `[]` or a missing value clears the question.'],
        ['answers', '[{ section, question, value }]', 'batch', '1 to 50 answers, in place of the three fields above. If the same question appears twice, the last one wins.'],
        ['contentEnv', '"live" | "preview"', 'no', 'Which published questions to validate against.'],
      ],
      success: {
        status: 200,
        body: json({
          ok: true,
          userId: '<userId>',
          saved: [
            { section: 'identity', question: 'identity-current' },
            { section: 'identity', question: 'identity-target' },
            { section: 'governance', question: 'status' },
          ],
          revs: { identity: 4, governance: 2 },
          savedAt: NOW,
        }),
      },
      errors: [
        { status: 400, when: 'Empty batch or more than 50', body: json({ ok: false, error: 'answers must list 1 to 50 answers' }) },
        { status: 400, when: 'Bad section or question ID (keyed by position in the batch)', body: json({ ok: false, errors: { 'answers.0.section': 'unknown section', 'answers.2.question': 'invalid question id' } }) },
        { status: 400, when: 'Value not valid for the published question (keyed by section)', body: json({ ok: false, errors: { 'discovery.answers.focus': 'unknown option growth', 'identity.answers.identity-target': 'at most 1' } }) },
        { status: 400, when: 'userId is not a UUID', body: json({ ok: false, error: 'invalid userId' }) },
        { status: 403, when: 'Response not linked to a user (nothing stored)', body: json({ ok: false, error: 'response is not linked to a user', hint: 'start the response with leadRef, or link it with op "link", first' }) },
        { status: 404, when: 'No such response, or userId is not the response\'s', body: json({ ok: false, error: 'not found' }) },
      ],
      curl: [curlPost('guided-discovery', answerOne), '', '# batch', curlPost('guided-discovery', answerBatch), '', '# clear a question', curlPost('guided-discovery', answerClear)].join('\n'),
      fetch: [fetchPost('guided-discovery', answerBatch)].join('\n'),
      notes: [
        'Only answers that can be attributed to a person are stored: a response started without `leadRef` (and never linked) gets `403`. The assessment page\'s own `save` autosave still works for unlinked visitors.',
        'All or nothing: every answer is checked first, and if any is invalid nothing is stored and `errors` lists each problem.',
        'The server bumps the `rev` of each section it touched and returns them in `revs`; you don\'t send a `rev`. Answering a completed response recalculates its `result`; otherwise the status becomes `in_progress`.',
        'One writer per section: if the assessment page has the same response open, its next autosave of that section re-sends its own copy of the whole section and overwrites answers posted here.',
        'Added in PR #21 (`feat/answer-api`).',
      ],
    },
    {
      id: 'responses-save',
      title: 'Save a section',
      method: 'POST',
      summary: '`op: "save"`. Replaces a whole section\'s answers, guarded by a client revision number. This is what the assessment page\'s autosave uses. Can also save `progress` on its own.',
      fields: [
        ['op', '"save"', 'yes', ''],
        ['responseId', 'uuid', 'yes', ''],
        ['section', 'string', 'with data', 'Section ID. Not `summary` or `overview`.'],
        ['rev', 'integer >= 1', 'with section', 'Must be greater than the stored revision for that section, or the save is rejected with `409`.'],
        ['data', '{ answers: { questionId: string[] } }', 'with section', 'The complete set of answers for the section. Questions left out are removed. No other keys are allowed in `data`.'],
        ['progress', '{ completed: string[] }', 'no', 'Section IDs the person has finished, up to 40. Merged into the stored progress. A legacy `lastPage` key is accepted and dropped.'],
        ['contentEnv', '"live" | "preview"', 'no', ''],
      ],
      success: { status: 200, body: json({ ok: true, rev: 3, savedAt: NOW }) },
      errors: [
        { status: 400, when: 'Neither section nor progress sent', body: json({ ok: false, error: 'section or progress required' }) },
        { status: 400, when: 'rev missing or not a positive integer', body: json({ ok: false, error: 'rev must be a positive integer' }) },
        { status: 400, when: 'Invalid answers or progress', body: json({ ok: false, errors: { section: 'unknown section', 'identity.answers.identity-target': 'must be an array of option ids', 'progress.completed': 'must be an array' } }) },
        { status: 404, when: 'No such response', body: json({ ok: false, error: 'not found' }) },
        { status: 409, when: 'rev is not newer than the stored one; rev is the stored revision', body: json({ ok: false, error: 'stale revision', rev: 3 }) },
      ],
      curl: curlPost('guided-discovery', saveBody),
      fetch: fetchPost('guided-discovery', saveBody),
      notes: [
        'A progress-only save (`{op, responseId, progress}`) returns `{ok, savedAt}` without `rev`.',
        'If the published questions can\'t be fetched, answers are checked for shape only and stored with `contentHash: null`.',
      ],
    },
    {
      id: 'responses-complete',
      title: 'Complete a response',
      method: 'POST',
      summary: '`op: "complete"`. Scores the stored answers against the published summary and sections, stores the result and sets status `completed`.',
      fields: [
        ['op', '"complete"', 'yes', ''],
        ['responseId', 'uuid', 'yes', ''],
        ['contentEnv', '"live" | "preview"', 'no', 'Which published content to score against.'],
      ],
      success: { status: 200, body: json({ ok: true, result: RESULT }) },
      errors: [
        { status: 400, when: 'Bad or missing responseId', body: json({ ok: false, error: 'invalid responseId' }) },
        { status: 404, when: 'No such response', body: json({ ok: false, error: 'not found' }) },
        { status: 503, when: 'Published content unreachable; retry', body: json({ ok: false, error: 'content unavailable, try again' }) },
      ],
      curl: curlPost('guided-discovery', completeBody),
      fetch: fetchPost('guided-discovery', completeBody),
      notes: ['Completing again rescores and keeps the original `completedAt`. Later `save` or `answer` calls keep the result up to date.'],
    },
    {
      id: 'responses-resume',
      title: 'Resume a response',
      method: 'GET',
      summary: '`?responseId=<uuid>`. Returns what a client needs to pick up where the person left off: answers and revision per section, progress and result. No profile data.',
      fieldsLabel: 'Query parameters',
      fields: [['responseId', 'uuid', 'yes', '`sessionId` is accepted as a deprecated alias.']],
      success: {
        status: 200,
        body: json({
          ok: true,
          response: {
            responseId: '<responseId>',
            assessment: 'self-guided',
            status: 'completed',
            contentVersion: 'structured-content',
            linked: true,
            leadSubmissionId: '<submissionId>',
            sections: {
              discovery: { answers: { focus: ['activation'] } },
              identity: { answers: { 'identity-current': ['deterministic-login'], 'identity-target': ['unified-graph'] } },
              governance: { answers: { status: ['consent:gap', 'data-labels:in-place'] } },
            },
            revs: { discovery: 1, identity: 4, governance: 2 },
            progress: { completed: ['discovery', 'identity', 'governance'] },
            result: RESULT,
            createdAt: NOW,
            updatedAt: NOW,
            completedAt: NOW,
          },
          session: '{ ...the same, with sessionId and "sc-" section keys (deprecated) }',
        }),
      },
      errors: [
        { status: 400, when: 'Bad or missing responseId', body: json({ ok: false, error: 'invalid responseId' }) },
        { status: 404, when: 'No such response', body: json({ ok: false, error: 'not found' }) },
      ],
      curl: curlGet('guided-discovery', 'responseId=<responseId>'),
      fetch: fetchGetExpr("BASE + '/guided-discovery?responseId=' + encodeURIComponent(responseId)"),
    },
    {
      id: 'responses-by-user',
      title: 'All answers for a person',
      method: 'GET',
      summary: '`?op=answers&userId=<uuid>&responseId=<uuid>`. Every response (run) of one person, newest first, with each answer labelled from the question bank, plus status and result. The `responseId` is the secret: it must be one of that person\u2019s own responses, so a `userId` alone reads nothing.',
      fieldsLabel: 'Query parameters',
      fields: [
        ['op', '"answers"', 'yes', ''],
        ['userId', 'uuid', 'yes', 'From the profile `create` response.'],
        ['responseId', 'uuid', 'yes', 'Any response of this person (the resume token their browser keeps). Proves the caller is that person.'],
        ['assessment', 'string', 'no', 'Only runs of this assessment, e.g. `self-guided`.'],
      ],
      success: {
        status: 200,
        body: json({
          ok: true,
          userId: '<userId>',
          count: 2,
          responses: [
            {
              responseId: '<responseId>',
              assessment: 'self-guided',
              submissionId: '<submissionId>',
              status: 'in_progress',
              progress: { completed: ['discovery'] },
              sections: [
                {
                  section: 'discovery',
                  title: 'Start here · Technology-agnostic',
                  savedAt: NOW,
                  answers: [{ question: 'focus', text: "Where's your focus?", values: [{ value: 'activation', label: 'Acting on what you know' }] }],
                },
                {
                  section: 'governance',
                  title: 'Governance & Access',
                  savedAt: NOW,
                  answers: [{ question: 'status', text: 'Sort each control', values: [{ value: 'consent:gap', option: 'consent', optionLabel: 'Consent & Identity Governance', choice: 'gap', choiceLabel: 'Gap for us' }] }],
                },
              ],
              result: null,
              createdAt: NOW,
              updatedAt: NOW,
              completedAt: null,
            },
            { assessment: 'self-guided', status: 'completed', '...': 'another run (no responseId)' },
          ],
        }),
      },
      errors: [
        { status: 400, when: 'Missing or malformed userId / responseId', body: json({ ok: false, error: 'userId and responseId are required' }) },
        { status: 400, when: 'Unknown assessment', body: json({ ok: false, error: 'unknown assessment' }) },
        { status: 404, when: 'The responseId does not exist, is not linked to a person, or belongs to someone else (one message for all, so it reveals nothing)', body: json({ ok: false, error: 'not found' }) },
      ],
      curl: curlGet('guided-discovery', 'op=answers&userId=<userId>&responseId=<responseId>'),
      fetch: fetchGetExpr("BASE + '/guided-discovery?op=answers&userId=' + encodeURIComponent(userId) + '&responseId=' + encodeURIComponent(responseId)"),
      notes: [
        'Only the `responseId` you sent is echoed back. Other runs are listed without theirs, because a `responseId` also lets you write answers.',
        'Each value keeps the stored `value` and adds labels by question type: `label` (option or free text); `option`/`optionLabel` + `choice`/`choiceLabel` (choice per option or item); `option`/`optionLabel` + `text` (owner) or `followUp: true`.',
        'Only responses linked to a profile (started with `leadRef`, or linked later) have a `userId`, so unlinked runs never appear. Up to 100 runs are returned.',
      ],
    },
  ],
};

// ---------- questions API ----------

const saveExisting = {
  op: 'question-save',
  assessment: 'self-guided',
  question: {
    questionId: 'focus',
    update: true,
    title: "Where's your focus today?",
    help: '',
    required: true,
    options: [
      { key: 'analysis', label: 'Understanding your customers' },
      { key: 'activation', label: 'Acting on what you know' },
      { key: 'both', label: 'Both' },
    ],
  },
  editor: 'jordan.rivera@example.com',
};
const saveNew = {
  op: 'question-save',
  assessment: 'self-guided',
  question: {
    questionId: 'budget-owner',
    section: 'strategy-adoption',
    title: 'Who owns the budget for this migration?',
    type: 'single',
    required: false,
    options: [
      { key: 'marketing', label: 'Marketing' },
      { key: 'it', label: 'IT' },
      { key: 'shared', label: 'Shared' },
    ],
  },
};
const PUBLIC_QUESTION = {
  question: 'focus',
  text: "Where's your focus?",
  type: 'single',
  display: 'cards-single',
  required: true,
  options: [{ key: 'analysis', label: 'Understanding your customers' }, { key: 'activation', label: 'Acting on what you know' }, { key: 'both', label: 'Both' }],
};

const questionsApi = {
  id: 'questions',
  title: 'Questions API',
  action: 'guided-discovery, assessments-admin',
  intro: [
    'The question bank (collection `assessment_questions`) holds every question of an assessment: section, key, full text, answer type and options. The responses API checks answers against it, and the Questions page of this viewer edits it.',
    'Keys are the stable IDs stored with answers: `section` and `question` in `answer` / `save` calls, and option `key`s as values. Keys are fixed once saved; saved options can be relabelled but not removed, and a saved question\'s answer type cannot change.',
    'Changes reach the responses API within about 30 seconds. Scoring thresholds and capability copy still come from the assessment\'s summary document in DA.',
  ],
  ops: [
    {
      id: 'questions-list',
      title: 'List questions (public)',
      method: 'GET',
      summary: '`?op=questions` on `guided-discovery`. Everything a front end needs to show the questions and post answers, in page order. No authentication; the bank holds no personal data.',
      fieldsLabel: 'Query parameters',
      fields: [
        ['op', '"questions"', 'yes', ''],
        ['assessment', 'string', 'no', 'Defaults to `self-guided`.'],
      ],
      success: {
        status: 200,
        body: json({
          ok: true,
          assessment: 'self-guided',
          sections: [{ section: 'discovery', title: 'Start here · Technology-agnostic', questions: [PUBLIC_QUESTION, { question: 'notes', text: 'Anything else we should know?', type: 'text', display: 'text', required: false, options: [] }] }],
        }),
      },
      errors: [
        { status: 400, when: 'Unknown assessment', body: json({ ok: false, error: 'unknown assessment' }) },
      ],
      curl: curlGet('guided-discovery', 'op=questions&assessment=self-guided'),
      fetch: fetchGet('guided-discovery', 'op=questions&assessment=self-guided'),
      notes: [
        '`type` tells you how to answer: `single` (one option key), `multiple` (any option keys), `text` (one string, up to 500 characters). Seeded questions can also be `choice per option` (sort, values `optionKey:choiceKey`), `choice per item` (values `itemKey:choiceKey`, items are the options of `itemsFrom`) or `owner per option` (`optionKey=Name`, `optionKey:follow-up`). See Answer value formats.',
        '`choices` (sort and per-item questions) and `itemsFrom` (per-item) appear only when they apply.',
      ],
    },
    {
      id: 'questions-admin-list',
      title: 'List the bank (admin)',
      method: 'GET',
      summary: '`?dataset=questions` on `assessments-admin`. The stored question documents with their bookkeeping fields, in page order. Requires an Adobe IMS user token.',
      fieldsLabel: 'Query parameters',
      fields: [
        ['dataset', '"questions"', 'yes', ''],
        ['assessment', 'string', 'no', 'Defaults to `self-guided`.'],
      ],
      success: {
        status: 200,
        body: json({
          ok: true,
          dataset: 'questions',
          total: 23,
          count: 23,
          items: [{ assessment: 'self-guided', questionId: 'focus', section: 'discovery', sectionTitle: 'Start here · Technology-agnostic', sectionOrder: 0, order: 0, title: "Where's your focus?", display: 'cards-single', required: true, options: [{ id: 'analysis', label: 'Understanding your customers', '...': '...' }], updatedAt: NOW, updatedBy: 'seed from DA', '...': '...' }],
        }),
      },
      errors: [
        { status: 400, when: 'Unknown assessment', body: json({ ok: false, error: 'invalid assessment' }) },
        { status: 401, when: 'Missing or invalid IMS token (gateway error body)', body: '{ "error": "<gateway message>" }' },
      ],
      curl: curlGet('assessments-admin', 'dataset=questions&assessment=self-guided', ADMIN_CURL_HEADERS),
      fetch: fetchGet('assessments-admin', 'dataset=questions&assessment=self-guided', ADMIN_FETCH_HEADERS),
      notes: ['Stored options use `id` (the key) and may carry seeded extras such as `capabilities`, which saving keeps.'],
    },
    {
      id: 'questions-save',
      title: 'Create or update a question (admin)',
      method: 'POST',
      summary: '`op: "question-save"` on `assessments-admin`. Creates a question, or updates a saved one when `question.update` is true. Requires an Adobe IMS user token.',
      fields: [
        ['op', '"question-save"', 'yes', ''],
        ['assessment', 'string', 'no', 'Defaults to `self-guided`.'],
        ['question.questionId', 'string', 'yes', 'The key: lowercase letters, numbers and hyphens, up to 64. Fixed once saved.'],
        ['question.update', 'boolean', 'for updates', '`true` to update a saved question (404 if it does not exist). Without it the call creates, and a key that is already used is rejected.'],
        ['question.section', 'string', 'new only', 'Section key. An existing section, or a new one (then `sectionTitle` is required). Ignored on update.'],
        ['question.sectionTitle', 'string', 'new section', 'Up to 120 characters.'],
        ['question.title', 'string', 'yes', 'The full question text, up to 500 characters.'],
        ['question.help', 'string', 'no', 'Up to 1000 characters.'],
        ['question.type', '"single" | "multiple" | "text"', 'new only', 'The answer type. Cannot change once saved.'],
        ['question.required', 'boolean', 'no', 'Defaults to false.'],
        ['question.options', '{key, label}[]', 'yes*', 'Every saved option must still be listed (relabel freely, add new ones). *Not for `text` questions.'],
        ['editor', 'string', 'no', 'Who made the change (stored as `updatedBy`); the viewer sends the signed-in email.'],
      ],
      success: { status: 200, body: json({ ok: true, created: false, question: { questionId: 'focus', title: "Where's your focus today?", '...': '...' } }) },
      errors: [
        { status: 201, when: 'A new question was created (added last in its section)', body: json({ ok: true, created: true, question: { questionId: 'budget-owner', '...': '...' } }) },
        { status: 400, when: 'Field errors (all reported at once)', body: json({ ok: false, errors: { title: 'required', options: 'saved options cannot be removed: both', 'options.2.key': 'duplicate key' } }) },
        { status: 400, when: 'Changing a saved question\'s type', body: json({ ok: false, errors: { type: 'the answer type of a saved question cannot change' } }) },
        { status: 404, when: '`update: true` but no such question', body: json({ ok: false, errors: { questionId: 'not found' } }) },
        { status: 400, when: 'Creating with a key that is already used', body: json({ ok: false, errors: { questionId: 'this key is already used' } }) },
      ],
      curl: [curlPost('assessments-admin', saveExisting, ADMIN_CURL_HEADERS), '', '# add a question', curlPost('assessments-admin', saveNew, ADMIN_CURL_HEADERS)].join('\n'),
      fetch: fetchPost('assessments-admin', saveNew, ADMIN_FETCH_HEADERS + ', '),
      notes: ['There is no delete: stored answers reference question and option keys.'],
    },
  ],
};

// ---------- admin API ----------

const deleteOne = { op: 'delete', dataset: 'assessments', id: '<submissionId>' };
const deleteMany = { op: 'delete', dataset: 'responses', ids: ['<responseId-1>', '<responseId-2>'] };

const adminApi = {
  id: 'admin',
  title: 'Admin API',
  action: 'assessments-admin',
  intro: [
    'Lists and deletes profiles and responses. Returns full records, including personal data, so it requires an Adobe IMS user token from this project\'s org: `Authorization: Bearer <token>` and `x-gw-ims-org-id: <org id>`. This viewer gets both from the Experience Cloud shell.',
    'Datasets: `assessments` (profiles, keyed by `submissionId`) and `responses` (answers, keyed by `responseId`). `guided-discovery` is a deprecated alias for `responses`.',
  ],
  ops: [
    {
      id: 'admin-list',
      title: 'List records',
      method: 'GET',
      summary: 'Newest first (by `createdAt`). Responses come with the linked profile attached as `profile`.',
      fieldsLabel: 'Query parameters',
      fields: [
        ['dataset', '"assessments" | "responses"', 'no', 'Defaults to `assessments`.'],
        ['assessment', 'string', 'no', 'Filter by assessment, e.g. `self-guided`.'],
        ['status', '"started" | "in_progress" | "completed"', 'no', 'Filter by status.'],
        ['limit', 'integer', 'no', '1 to 500, default 200.'],
        ['skip', 'integer', 'no', 'Records to skip, for paging. Default 0.'],
      ],
      success: {
        status: 200,
        body: json({
          ok: true,
          dataset: 'responses',
          total: 42,
          count: 2,
          items: [{ responseId: '<responseId>', assessment: 'self-guided', status: 'completed', submissionId: '<submissionId>', profile: { email: 'jordan.rivera@example.com', '...': '...' }, '...': '...' }],
        }),
      },
      errors: [
        { status: 400, when: 'Unknown dataset', body: json({ ok: false, error: 'invalid dataset' }) },
        { status: 400, when: 'Unknown status', body: json({ ok: false, error: 'invalid status' }) },
        { status: 400, when: 'Unknown assessment', body: json({ ok: false, error: 'invalid assessment' }) },
        { status: 401, when: 'Missing or invalid IMS token. Sent by the App Builder gateway, so the body is the gateway\'s own error, not the {ok:false} shape.', body: '{ "error": "<gateway message>" }' },
      ],
      curl: curlGet('assessments-admin', 'dataset=responses&assessment=self-guided&status=completed&limit=50&skip=0', ADMIN_CURL_HEADERS),
      fetch: fetchGet('assessments-admin', 'dataset=responses&assessment=self-guided&status=completed&limit=50', ADMIN_FETCH_HEADERS),
      notes: ['`total` counts every match; `count` is the size of this page. Items are the stored documents, including `_id` and `client`.'],
    },
    {
      id: 'admin-delete',
      title: 'Delete records',
      method: 'POST',
      summary: '`op: "delete"`. Permanently removes one record (`id`) or up to 100 (`ids`). There is no undo.',
      fields: [
        ['op', '"delete"', 'yes', ''],
        ['dataset', '"assessments" | "responses"', 'no', 'Defaults to `assessments`.'],
        ['id', 'uuid', 'one of', 'The `submissionId` or `responseId` to delete. (Deprecated: `submissionId` / `responseId` in place of `id`.)'],
        ['ids', 'uuid[]', 'one of', '1 to 100 IDs (duplicates are ignored). Every one must be a UUID or nothing is deleted.'],
      ],
      success: { status: 200, body: json({ ok: true, deleted: 1 }) },
      errors: [
        { status: 200, when: 'Batch: IDs that were already gone are reported, not an error', body: json({ ok: true, deleted: 1, notFound: ['<responseId-2>'] }) },
        { status: 400, when: 'op is not delete', body: json({ ok: false, error: 'op must be delete' }) },
        { status: 400, when: 'Bad id, or a bad id in ids', body: json({ ok: false, error: 'invalid id' }) },
        { status: 400, when: 'ids empty or more than 100', body: json({ ok: false, error: 'ids must list 1 to 100 records' }) },
        { status: 404, when: 'Single delete: no such record', body: json({ ok: false, error: 'not found' }) },
      ],
      curl: [curlPost('assessments-admin', deleteOne, ADMIN_CURL_HEADERS), '', '# several at once', curlPost('assessments-admin', deleteMany, ADMIN_CURL_HEADERS)].join('\n'),
      fetch: fetchPost('assessments-admin', deleteMany, ADMIN_FETCH_HEADERS + ', '),
      notes: ['Deleting a profile does not delete the responses linked to it, and vice versa.'],
    },
  ],
};

export const SECTIONS = [profileApi, responsesApi, questionsApi, adminApi];

// ---------- walkthrough ----------

export const WALKTHROUGH = {
  intro: 'From a new profile to a scored result and back, in the browser (from an allowed origin). Each step uses the previous step\'s IDs.',
  steps: [
    {
      title: 'Create the profile',
      text: 'Keep `submissionId`; it links the answers to this person.',
      code: [
        "const BASE = '" + BASE_URL + "';",
        "const post = (action, body) => fetch(BASE + '/' + action, {",
        "  method: 'POST',",
        "  headers: { 'Content-Type': 'application/json' },",
        '  body: JSON.stringify(body),',
        '}).then((r) => r.json());',
        '',
        "const { submissionId } = await post('assessments', " + indent(json({ op: 'create', profile: PROFILE, consent: true, source: SOURCE }), 0) + ');',
      ].join('\n'),
    },
    {
      title: 'Start a response linked to it',
      text: 'Pass the profile as `leadRef`. Store `responseId` (the assessment page keeps it in localStorage) to resume later.',
      code: "const { responseId, linked } = await post('guided-discovery', {\n  op: 'start', leadRef: submissionId, source: { source: 'aem-eds:/acs/cja-assessment' },\n});\n// linked === true",
    },
    {
      title: 'Answer one question',
      text: 'Only linked responses take answers (unlinked ones get `403`). Discovery focus is a single-choice question: `analysis`, `activation` or `both`.',
      code: "await post('guided-discovery', {\n  op: 'answer', responseId, section: 'discovery', question: 'focus', value: 'activation',\n});",
    },
    {
      title: 'Answer a batch',
      text: 'Up to 50 answers across sections, stored all or nothing. Identity stages are `none`, `deterministic-login`, `cross-channel`, `unified-graph`; governance `status` takes `optionId:choiceId` pairs.',
      code: "const res = await post('guided-discovery', {\n  op: 'answer',\n  responseId,\n  answers: [\n    { section: 'identity', question: 'identity-current', value: 'deterministic-login' },\n    { section: 'identity', question: 'identity-target', value: 'unified-graph' },\n    { section: 'governance', question: 'status', value: ['consent:gap', 'data-labels:in-place'] },\n  ],\n});\nif (!res.ok) console.log(res.errors); // nothing was stored",
    },
    {
      title: 'Complete it',
      text: 'The server scores the answers. Retry on `503`.',
      code: "const { result } = await post('guided-discovery', { op: 'complete', responseId });\n// result.readinessPct, result.headline, result.matchedCapabilities",
    },
    {
      title: 'Resume later',
      text: 'Answers, revisions, progress and the result, with no profile data.',
      code: "const { response } = await fetch(BASE + '/guided-discovery?responseId=' + encodeURIComponent(responseId))\n  .then((r) => r.json());\n// response.sections.discovery.answers.focus -> ['activation']",
    },
  ],
};

// ---------- answer value formats ----------

export const ANSWER_FORMATS = {
  intro: 'Every question stores an array of strings. What each string looks like depends on the question display (the `display` field of `GET ?op=questions`). `-single` displays and sliders take at most one value; unknown questions, options or choices are rejected. With `answer`, a single string is the same as a one-item array.',
  rows: [
    ['cards, chips, swipe, inventory, slider', 'option ID', '`"activation"` (discovery / focus), `"unified-graph"` (identity / identity-target)'],
    ['text (free text)', 'the text, at most one value', '`"We plan to migrate in Q3"`'],
    ['per-item (a choice about each picked item)', '`itemId:choiceId`, one per item', '`"evar-product:multiple"`'],
    ['sort (a choice about every option)', '`optionId:choiceId`, one per option', '`"consent:gap"`, `"data-labels:in-place"` (governance / status)'],
    ['owner-cards', '`optionId=owner name` (up to 120 characters), and `optionId:follow-up`', '`"analyst=Pat Lee"`, `"analyst:follow-up"` (roles / owners)'],
  ],
  limits: 'At most 100 values per question, each up to 500 characters. Duplicate values are dropped.',
};
