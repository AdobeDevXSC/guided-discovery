import actions from './config.json';

// config.json is generated at build time with the deployed action URLs.
const ENDPOINT = actions['marketingprototype/assessments-admin'] || actions['assessments-admin'];

async function call(url, init) {
  if (!ENDPOINT) throw new Error('assessments-admin action URL not found in config.json; run aio app build');
  const res = await fetch(url, init);
  let body = null;
  try { body = await res.json(); } catch (e) { /* non-JSON error page */ }
  if (!res.ok || !body || body.ok === false) {
    const err = new Error((body && (body.error || body.message)) || (body && body.errors ? 'Please fix the highlighted fields.' : `Request failed (${res.status})`));
    err.status = res.status;
    err.errors = (body && body.errors) || null;
    throw err;
  }
  return body;
}

const authHeaders = (token, org) => ({ Authorization: `Bearer ${token}`, 'x-gw-ims-org-id': org });

export async function fetchRecords({
  token, org, dataset, assessment, status, limit = 500,
}) {
  const qs = new URLSearchParams({ limit: String(limit), dataset });
  if (assessment) qs.set('assessment', assessment);
  if (status) qs.set('status', status);
  return call(`${ENDPOINT}?${qs}`, { headers: authHeaders(token, org) });
}

export async function deleteRecord({ token, org, dataset, id }) {
  return call(ENDPOINT, {
    method: 'POST',
    headers: { ...authHeaders(token, org), 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'delete', dataset, id }),
  });
}

/** Deletes several records in one call; resolves to { deleted, notFound }. */
export async function deleteRecords({
  token, org, dataset, ids,
}) {
  return call(ENDPOINT, {
    method: 'POST',
    headers: { ...authHeaders(token, org), 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'delete', dataset, ids }),
  });
}

/** The question bank for an assessment, in page order. */
export async function fetchQuestions({ token, org, assessment }) {
  const qs = new URLSearchParams({ dataset: 'questions', assessment });
  return call(`${ENDPOINT}?${qs}`, { headers: authHeaders(token, org) });
}

/** Creates or updates one question; resolves to { question, created } or rejects with field errors. */
export async function saveQuestion({
  token, org, assessment, question, editor,
}) {
  return call(ENDPOINT, {
    method: 'POST',
    headers: { ...authHeaders(token, org), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      op: 'question-save', assessment, question, editor,
    }),
  });
}

/** The responses linked to one profile, each laid out against the whole question bank. */
export async function fetchProfileAnswers({ token, org, submissionId }) {
  const qs = new URLSearchParams({ dataset: 'profile-answers', submissionId });
  return call(`${ENDPOINT}?${qs}`, { headers: authHeaders(token, org) });
}

/** Latest-run answers for every profile of an assessment, for the CSV export. */
export async function fetchAnswersExport({ token, org, assessment }) {
  const qs = new URLSearchParams({ dataset: 'answers-export', assessment });
  return call(`${ENDPOINT}?${qs}`, { headers: authHeaders(token, org) });
}

/** Settings page: the AI connection (the secret itself is never returned) and stored prompts. */
export async function fetchSettings({ token, org }) {
  return call(`${ENDPOINT}?${new URLSearchParams({ dataset: 'settings' })}`, { headers: authHeaders(token, org) });
}

const postAdmin = (token, org, body) => call(ENDPOINT, {
  method: 'POST',
  headers: { ...authHeaders(token, org), 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** prompt: { promptId? (omit to create), name, text } */
export async function savePrompt({
  token, org, prompt, editor,
}) {
  return postAdmin(token, org, { op: 'prompt-save', prompt, editor });
}

export async function deletePrompt({ token, org, promptId }) {
  return postAdmin(token, org, { op: 'prompt-delete', promptId });
}
