import restana from 'restana';
import fetch from 'node-fetch';
import { getPackageVersion } from '../../utils.js';

const service = restana();
const versionRouter = service.newRouter();

/**
 * Converts a dotted numeric string (e.g., '12.2.1.2') into a single integer (e.g., 12212).
 * Null safe: returns null for null/undefined/empty or non-numeric input.
 * Non-digits are removed; separators like '.' or '-' are ignored.
 *
 * @param {string|number|null|undefined} input
 * @returns {number|null}
 */
const toCompactNumber = (input) => {
  if (input == null) return null;
  const joined = String(input).match(/\d+/g)?.join('') ?? '';
  if (joined === '') return null;
  const n = Number(joined);
  return Number.isFinite(n) ? n : null;
};

versionRouter.get('/', async (req, res) => {
  const versionPayload = await getCurrentVersionFromGithub();
  res.body = versionPayload == null ? { newVersion: false } : versionPayload;
  res.send();
});

async function getCurrentVersionFromGithub() {
  const raw = await fetch('https://api.github.com/repos/orangecoding/fredy/releases/latest');
  const data = await raw.json();
  const localFredyVersion = await getPackageVersion();
  if (data.tag_name == null || toCompactNumber(localFredyVersion) >= toCompactNumber(data.tag_name)) {
    return null;
  }
  return {
    newVersion: true,
    version: data.tag_name,
    url: data.html_url,
    body: data.body,
    localFredyVersion,
  };
}

export { versionRouter };
