/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'testFixtures');

const testProviderConfig = JSON.parse(
  await readFile(new URL('./provider/testProvider.json', import.meta.url), 'utf-8'),
);

// hostname → providerName, built from testProvider.json
const hostnameToProvider = {};
// providerName → list page pathname (for distinguishing list vs detail URLs)
const providerListPath = {};

for (const [name, cfg] of Object.entries(testProviderConfig)) {
  if (!cfg.url) continue;
  try {
    const parsed = new URL(cfg.url);
    hostnameToProvider[parsed.hostname] = name;
    providerListPath[name] = parsed.pathname;
  } catch {
    // skip malformed URLs
  }
}

async function tryReadFile(filepath) {
  try {
    return await readFile(filepath, 'utf-8');
  } catch {
    return null;
  }
}

function withRealEstateType(data, realEstateType) {
  if (!realEstateType?.length || !Array.isArray(data?.resultListItems)) {
    return data;
  }

  const cloned = typeof structuredClone === 'function' ? structuredClone(data) : JSON.parse(JSON.stringify(data));
  for (const item of cloned.resultListItems) {
    if (item?.type === 'EXPOSE_RESULT' && item?.item) {
      item.item.realEstateType = realEstateType;
    }
  }
  return cloned;
}

/**
 * Providers name their extractor runs `<provider>_details…` when they load a detail page. That
 * name is the only hint available for aggregators whose exposes live on a partner domain, so it
 * resolves the provider when the hostname alone cannot.
 *
 * @param {{name?: string}} [options] options the provider passed to the extractor
 * @returns {string|null} the provider name or null if the run was not a detail run
 */
function providerFromExtractorName(options) {
  const match = /^([A-Za-z0-9]+)_details?/.exec(options?.name ?? '');
  return match != null && testProviderConfig[match[1]] != null ? match[1] : null;
}

/**
 * Returns fixture HTML for the given URL by mapping hostname → provider name,
 * then distinguishing list vs detail pages by comparing the URL path against
 * the configured list URL path from testProvider.json.
 *
 * @param {string} url the url the provider asked the extractor for
 * @param {{name?: string}} [options] options the provider passed to the extractor
 * @returns {Promise<string|null>} the fixture content or null when none is available
 */
export async function readFixture(url, options) {
  let hostname, pathname;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    pathname = parsed.pathname;
  } catch {
    return null;
  }

  const providerName = hostnameToProvider[hostname];
  if (!providerName) {
    // aggregators link to partner portals, so their detail fixture sits under an unknown hostname
    const detailProvider = providerFromExtractorName(options);
    return detailProvider == null ? null : tryReadFile(path.join(FIXTURES_DIR, `${detailProvider}_detail.html`));
  }

  if (providerListPath[providerName] === pathname) {
    return tryReadFile(path.join(FIXTURES_DIR, `${providerName}.html`));
  }

  // Detail page: prefer dedicated detail fixture, fall back to list fixture
  const detailHtml = await tryReadFile(path.join(FIXTURES_DIR, `${providerName}_detail.html`));
  if (detailHtml) return detailHtml;
  return tryReadFile(path.join(FIXTURES_DIR, `${providerName}.html`));
}

/**
 * Immowelt's listings come from its search BFF, which can only be reached from inside a browser
 * that holds a DataDome cookie. Offline mode therefore replaces the whole transport module rather
 * than a `fetch` or the extractor, and serves the two fixtures it would have produced.
 *
 * @returns {Promise<{classifieds: any[], detailHtml: string|null}>} the recorded BFF responses
 */
export async function readImmoweltFixtures() {
  const [rawClassifieds, detailHtml] = await Promise.all([
    tryReadFile(path.join(FIXTURES_DIR, 'immowelt_classifieds.json')),
    tryReadFile(path.join(FIXTURES_DIR, 'immowelt_detail.html')),
  ]);

  return {
    classifieds: rawClassifieds ? JSON.parse(rawClassifieds) : [],
    detailHtml,
  };
}

/**
 * Returns a fetch replacement that intercepts immoscout mobile API calls and
 * serves pre-downloaded JSON fixtures. Throws for any other URL to prevent
 * accidental live network traffic in offline mode.
 */
export function buildFetchMock() {
  let listData = null;
  let detailData = null;
  let deutscheWohnenListData = null;

  return async (url) => {
    const urlStr = String(url);

    if (urlStr.includes('api.mobile.immobilienscout24.de/search/list')) {
      if (!listData) {
        const raw = await tryReadFile(path.join(FIXTURES_DIR, 'immoscout_list.json'));
        listData = raw ? JSON.parse(raw) : { resultListItems: [] };
      }

      const requestedType = new URL(urlStr).searchParams.get('realestatetype');
      const responseData = withRealEstateType(listData, requestedType);
      return { ok: true, status: 200, json: () => Promise.resolve(responseData) };
    }

    if (urlStr.includes('api.mobile.immobilienscout24.de/expose/')) {
      if (!detailData) {
        const raw = await tryReadFile(path.join(FIXTURES_DIR, 'immoscout_detail.json'));
        detailData = raw ? JSON.parse(raw) : { sections: [], contact: {} };
      }
      return { ok: true, status: 200, json: () => Promise.resolve(detailData) };
    }

    if (urlStr.includes('deutsche-wohnen.com/api/deuwo-real-estate/list')) {
      if (!deutscheWohnenListData) {
        const raw = await tryReadFile(path.join(FIXTURES_DIR, 'deutscheWohnen_list.json'));
        deutscheWohnenListData = raw ? JSON.parse(raw) : { results: [] };
      }
      return { ok: true, status: 200, json: () => Promise.resolve(deutscheWohnenListData) };
    }

    throw new Error(`Network request blocked in offline mode: ${urlStr}`);
  };
}
