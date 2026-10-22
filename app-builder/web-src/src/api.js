import actions from './config.json';

// config.json is generated at build time with the deployed action URLs.
const ENDPOINT = actions['marketingprototype/assessments-admin'] || actions['assessments-admin'];

async function call(url, init) {
  if (!ENDPOINT) throw new Error('assessments-admin action URL not found in config.json; run aio app build');
  const res = await fetch(url, init);
  let body = null;
  try { body = await res.json(); } catch (e) { /* non-JSON error page */ }
  if (!res.ok || !body || body.ok === false) {
    const err = new Error((body && (body.error || body.message)) || `Request failed (${res.status})`);
    err.status = res.status;
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
