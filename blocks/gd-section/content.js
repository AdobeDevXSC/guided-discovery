/* Loads DA structured content documents through the structured content delivery service. */
import { contentEnv } from './session.js';

const SC_BASE = 'https://da-sc.adobeaem.workers.dev';
const DEFAULT_REPO = 'adobedevxsc/guided-discovery';

/** org/site from an EDS host (<ref>--<site>--<org>.aem.page|live); a fixed fallback elsewhere. */
function repoPath() {
  const m = window.location.hostname.match(/^[^.]+?--([a-z0-9-]+)--([a-z0-9-]+)\.aem\.(page|live)$/i);
  return m ? `${m[2]}/${m[1]}`.toLowerCase() : DEFAULT_REPO;
}

/** Site path of an authored content link, without an extension. */
export const contentPath = (link) => new URL(link, window.location.href).pathname.replace(/\.(json|html)$/, '');

/** The document's data for a content link (e.g. /forms/guided-discovery/discovery). */
export default async function loadStructured(link) {
  const path = contentPath(link);
  const res = await fetch(`${SC_BASE}/${contentEnv()}/${repoPath()}${path}`);
  if (!res.ok) throw new Error(`structured content ${path} returned ${res.status}`);
  const json = await res.json();
  return json.data || json;
}
