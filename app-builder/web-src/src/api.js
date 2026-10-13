import actions from './config.json';

// config.json is generated at build time with the deployed action URLs.
const ENDPOINT = actions['marketingprototype/assessments-admin'] || actions['assessments-admin'];

export async function fetchAssessments({ token, org, status, limit = 500 }) {
  if (!ENDPOINT) throw new Error('assessments-admin action URL not found in config.json; run aio app build');
  const qs = new URLSearchParams({ limit: String(limit) });
  if (status) qs.set('status', status);

  const res = await fetch(`${ENDPOINT}?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, 'x-gw-ims-org-id': org },
  });
  let body = null;
  try { body = await res.json(); } catch (e) { /* non-JSON error page */ }

  if (!res.ok || !body || body.ok === false) {
    const err = new Error((body && (body.error || body.message)) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}
