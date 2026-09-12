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

/**
 * idealista is three national sites in one provider, and each of them is a recording of its own:
 * the Italian search page under the provider's plain name, the Spanish one beside it. Portugal has
 * no recording and reads the Spanish page - the markup of a card is identical on all three, and
 * what a fixture pins is the markup.
 */
const IDEALISTA_PAGES = {
  'www.idealista.it': 'idealista.html',
  'www.idealista.com': 'idealista_es.html',
  'www.idealista.pt': 'idealista_es.html',
};

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

  if (IDEALISTA_PAGES[hostname] != null) {
    return tryReadFile(path.join(FIXTURES_DIR, IDEALISTA_PAGES[hostname]));
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

/** Hosts whose providers request their pages themselves instead of going through the extractor. */
const FETCHED_PAGE_HOSTS = ['subito.it', 'www.idealista.it', 'www.idealista.com', 'www.idealista.pt'];

/** The app's api, on any of its three national hosts. `<cc>` follows the version in every path. */
const IDEALISTA_API = /app\.idealista\.(it|com|pt)\/api/;
const IDEALISTA_TOKEN = /app\.idealista\.(it|com|pt)\/api\/oauth\/token/;
const IDEALISTA_LOCATIONS = /app\.idealista\.(it|com|pt)\/api\/3\.5\/(it|es|pt)\/search\/locations/;
const IDEALISTA_SEARCH = /app\.idealista\.(it|com|pt)\/api\/3\.5\/(it|es|pt)\/search/;

/**
 * Returns a fetch replacement that intercepts immoscout mobile API calls and
 * serves pre-downloaded JSON fixtures. Throws for any other URL to prevent
 * accidental live network traffic in offline mode.
 */
export function buildFetchMock() {
  let idealistaCatalogue = null;
  let idealistaListData = null;
  let listData = null;
  let detailData = null;
  let deutscheWohnenListData = null;
  let willhabenHtml = null;
  let flatfoxPins = null;
  let flatfoxListings = null;

  return async (url, init) => {
    const urlStr = String(url);
    const requestBody = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');

    // willhaben reads its results out of the page's __NEXT_DATA__, so this is the one fixture
    // served as text rather than json.
    if (urlStr.includes('willhaben.at/iad/')) {
      if (willhabenHtml == null) {
        willhabenHtml = (await tryReadFile(path.join(FIXTURES_DIR, 'willhaben.html'))) ?? '';
      }
      return { ok: true, status: 200, text: () => Promise.resolve(willhabenHtml) };
    }

    // Idealista is read through the api the android app talks to - one host per country, the same
    // answers - so its fixtures are what that api gives. The token is not one of them: it is minted
    // per install and says nothing about the search, so offline mode hands out one of its own. The
    // recorded catalogue is Italian, so a search on another country's api finds no location and the
    // run falls back to the recorded page, which is the flow that fixture is there to exercise.
    if (IDEALISTA_TOKEN.test(urlStr)) {
      return { ok: true, status: 200, json: () => Promise.resolve({ access_token: 'offline', expires_in: 3600 }) };
    }

    // The catalogue is read one location at a time, and which one is asked for is in the body.
    if (IDEALISTA_LOCATIONS.test(urlStr)) {
      if (idealistaCatalogue == null) {
        const raw = await tryReadFile(path.join(FIXTURES_DIR, 'idealista_locations.json'));
        idealistaCatalogue = raw ? JSON.parse(raw) : {};
      }
      const asked = requestBody.get('locationIds') ?? '';
      return { ok: true, status: 200, json: () => Promise.resolve(idealistaCatalogue[asked] ?? { provinces: [] }) };
    }

    // One recorded page stands for the whole search, so it answers as the only page there is and
    // every page after it comes back empty, which is what stops the walk.
    if (IDEALISTA_SEARCH.test(urlStr)) {
      if (idealistaListData == null) {
        const raw = await tryReadFile(path.join(FIXTURES_DIR, 'idealista_list.json'));
        idealistaListData = raw ? JSON.parse(raw) : { elementList: [] };
      }
      const page = Number(requestBody.get('numPage')) || 1;
      const data =
        page === 1
          ? { ...idealistaListData, actualPage: 1, totalPages: 1 }
          : { ...idealistaListData, elementList: [], actualPage: page, totalPages: page };
      return { ok: true, status: 200, json: () => Promise.resolve(data) };
    }

    // The outline of one of the areas a `/multi/` search names. A triangle is enough: what the
    // tests read is that the parser turns the encoding into a ring, not where the ring is.
    if (/mt1\.idealista\.(it|com|pt)/.test(urlStr)) {
      return { ok: true, status: 200, text: () => Promise.resolve('((_p~iF~ps|U_ulLnnqC_mqNvxq`@))') };
    }

    // Anything else the app's api is asked for - an advert's own detail, which is where the dates
    // live - is answered with nothing rather than blocked: the fixture run is about the search.
    if (IDEALISTA_API.test(urlStr)) {
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }

    // The providers that read a page over plain `fetch` because their portal serves one without a
    // fight. `readFixture` tells a search page from a detail page by its path, which is the same
    // answer the extractor mock above gives the providers that go through a browser.
    if (FETCHED_PAGE_HOSTS.some((host) => urlStr.includes(host))) {
      const html = (await readFixture(urlStr)) ?? '';
      return { ok: true, status: 200, text: () => Promise.resolve(html) };
    }

    // Flatfox answers a search in two calls - the pins, then the listings those keys belong to -
    // and both have to be served for the provider to get through its own flow.
    if (urlStr.includes('flatfox.ch/api/v1/pin/')) {
      if (flatfoxPins == null) {
        const raw = await tryReadFile(path.join(FIXTURES_DIR, 'flatfox_pins.json'));
        flatfoxPins = raw ? JSON.parse(raw) : [];
      }
      return { ok: true, status: 200, json: () => Promise.resolve(flatfoxPins) };
    }

    if (urlStr.includes('flatfox.ch/api/v1/public-listing/')) {
      if (flatfoxListings == null) {
        const raw = await tryReadFile(path.join(FIXTURES_DIR, 'flatfox_listings.json'));
        flatfoxListings = raw ? JSON.parse(raw) : { results: [] };
      }
      return { ok: true, status: 200, json: () => Promise.resolve(flatfoxListings) };
    }

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
      // The endpoint caps a page at 50 and the provider walks the rest with `offset`, so serving
      // the whole fixture to every request would hand the same listings back on each page and
      // never let the walk end. Slicing is what makes the fixture behave like the endpoint.
      const params = new URL(urlStr).searchParams;
      const offset = Number.parseInt(params.get('offset') ?? '0', 10) || 0;
      const limit = Number.parseInt(params.get('limit') ?? '', 10) || (deutscheWohnenListData.results ?? []).length;
      const page = {
        ...deutscheWohnenListData,
        results: (deutscheWohnenListData.results ?? []).slice(offset, offset + limit),
      };
      return { ok: true, status: 200, json: () => Promise.resolve(page) };
    }

    throw new Error(`Network request blocked in offline mode: ${urlStr}`);
  };
}
