/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import Extractor from '../services/extractor/extractor.js';
import { acquireWarmPage } from '../services/extractor/warmPages.js';
import { queryPageUrl } from '../utils/pageUrl.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.mcmakler.de';

/** How many adverts one page of the listing api carries; the site's own pager asks for this many. */
const API_PAGE_SIZE = 30;

/** Query parameters that name the place of a search. A search without one is all of Germany. */
const PLACE_PARAMS = ['city', 'placeId'];

/**
 * The listing cards no longer carry the title as visible text. The only place it survives is the
 * aria label of the overlay link, which reads `<title>, <address>, <price>, <primary stat>`.
 * Titles themselves may contain commas, so the address is used as anchor and the trailing
 * segments are dropped as fallback.
 *
 * @param {string|null|undefined} ariaLabel aria label of the card's overlay link
 * @param {string|null|undefined} address address as shown on the card, e.g. `40627 Düsseldorf`
 * @returns {string} the plain listing title or an empty string if it cannot be determined
 */
function extractTitle(ariaLabel, address) {
  if (!ariaLabel) return '';

  if (address) {
    const addressMarker = `, ${address},`;
    const addressIndex = ariaLabel.lastIndexOf(addressMarker);
    if (addressIndex > 0) {
      return ariaLabel.slice(0, addressIndex).trim();
    }
  }

  const segments = ariaLabel.split(',');
  return (segments.length > 3 ? segments.slice(0, -3).join(',') : ariaLabel).trim();
}

/**
 * The card stats are only available as aria labels with a leading description,
 * e.g. `Wohnfläche 95 m²` or `4 Zimmer`, so the number has to be picked out first.
 *
 * @param {string|null|undefined} statLabel aria label of a single card stat
 * @returns {number|null} the number contained in the label or null if there is none
 */
function extractStatNumber(statLabel) {
  const match = statLabel?.match(/\d+(?:[.,]\d+)*/);
  return match == null ? null : extractNumber(match[0]);
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const originalId = (o.id || '').split('/').pop();
  const id = buildHash(originalId, o.price);
  const link = o.link != null ? `${BASE_URL}${o.link}` : o.link;
  const address = o.address?.replace(' / ', ' ') || null;
  // plots do not have a living space, for those the plot size is the only meaningful size
  const size = extractStatNumber(o.livingSpace) ?? extractStatNumber(o.plotSize);
  return {
    id,
    link,
    title: extractTitle(o.ariaLabel, address),
    price: extractNumber(o.price),
    size,
    rooms: extractStatNumber(o.rooms),
    address,
    image: o.image,
    description: undefined,
  };
}
/**
 * One advert of the listing api in the shape the search cards are crawled into, so `normalize`
 * reads both alike: the overlay link's path, its aria label, the stats by their aria labels.
 *
 * @param {any} advert one entry of the api's `listings`
 * @returns {Object}
 */
function cardOf(advert) {
  const stat = (kind) => advert?.stats?.find((entry) => entry?.kind === kind)?.ariaLabel ?? null;
  const link = advert?.detailPath != null ? `/immobilien${advert.detailPath}` : null;
  return {
    id: link,
    link,
    ariaLabel: advert?.ariaSummaryLabel ?? null,
    price: advert?.priceLabel ?? null,
    address: advert?.location ?? null,
    livingSpace: stat('living'),
    plotSize: stat('plot'),
    rooms: stat('rooms'),
    image: advert?.imageUrl ?? null,
  };
}

/**
 * Read page `page` (two or later) of a search from the site's listing api.
 *
 * The rendered search shows its first thirty adverts and a pager whose pages the site fetches from
 * `/immobilien/api/listings`, the search's own query plus `skip` and `limit`. Cloudflare answers node
 * with 403, so the request is made from a page of the site in the run's browser. A search without a
 * place has no pager on the site, and the api answers such a request with Berlin's adverts, so it
 * has no further pages here either. Checked live on 2026-11-22.
 *
 * @param {string} url the search url
 * @param {number} page counted from one, at least two
 * @param {any} browser the shared browser of the current job run
 * @returns {Promise<Object[]>}
 */
async function readApiPage(url, page, browser) {
  const query = new URL(url).searchParams;
  if (!PLACE_PARAMS.some((name) => query.has(name))) return [];
  query.delete('page');
  query.set('skip', String((page - 1) * API_PAGE_SIZE));
  query.set('limit', String(API_PAGE_SIZE));

  const site = await acquireWarmPage(browser, BASE_URL, { label: 'mcMakler' });
  const answer = await site.evaluate(async (path) => {
    try {
      const response = await fetch(path, { credentials: 'include' });
      return response.ok ? { body: await response.json() } : { status: response.status };
    } catch (error) {
      return { status: 0, error: String(error?.message || error) };
    }
  }, `/immobilien/api/listings?${query}`);

  if (answer.body?.ok !== true || !Array.isArray(answer.body.listings)) {
    throw new Error(`mcMakler's listing api did not answer page ${page} (status ${answer.status ?? 200}).`);
  }
  return answer.body.listings.map(cardOf);
}

/**
 * Read one result page of a search: the first off the rendered cards, as the generic crawler always
 * did, the later ones from the listing api.
 *
 * @param {string} url the search url, its `page` set by `pageUrl`
 * @param {any} browser the shared browser of the current job run
 * @returns {Promise<Object[]>}
 */
async function getListings(url, browser) {
  const page = Math.max(1, Math.trunc(Number(new URL(url).searchParams.get('page'))) || 1);
  if (page > 1) return readApiPage(url, page, browser);

  const extractor = new Extractor({ browser });
  await extractor.execute(url, config.waitForSelector, 'mcMakler');
  return extractor.parseResponseText(config.crawlContainer, config.crawlFields, url) ?? [];
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList Terms the job wants filtered out.
 * @returns {boolean}
 */
function applyBlacklist(o, appliedBlackList) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}
/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  crawlContainer: 'article[id^="listing-card-"]',
  sortByDateParam: 'sort=newest',
  // ?priceMin=500&priceMax=1000
  priceRangeParams: { min: 'priceMin', max: 'priceMax' },
  // the extractor returns the inner html of this element, so it has to wrap all listing cards
  waitForSelector: 'section[aria-label="Immobilienliste"]',
  crawlFields: {
    id: 'a[href*="/expose/"]@href',
    link: 'a[href*="/expose/"]@href',
    // holds title, address, price and the primary stat, see extractTitle
    ariaLabel: 'a[href*="/expose/"]@aria-label',
    price: 'p | removeNewline | trim',
    address: 'h2 | removeNewline | trim',
    livingSpace: '[data-testid="card-stats"] div[aria-label^="Wohnfläche"]@aria-label',
    plotSize: '[data-testid="card-stats"] div[aria-label^="Grundstücksfläche"]@aria-label',
    rooms: '[data-testid="card-stats"] div[aria-label*="Zimmer"]@aria-label',
    image: 'img@src',
  },
  normalize: normalize,
  getListings,
  // `page=N`. Only the first page is rendered by the server; see readApiPage.
  pageUrl: queryPageUrl('page'),
  activityProbe: checkIfListingIsActive,
};
/**
 * Build a run-scoped provider configuration.
 *
 * Returns a fresh object on every call instead of mutating module-level state. Two jobs can be in
 * flight at once - a manual run started while the scheduler is working through the others - and a
 * shared mutable config meant the second job overwrote the first job's URL and blacklist mid-run,
 * so listings were fetched for one job and stored under another.
 *
 * @param {{url: string, enabled?: boolean}} sourceConfig The job's entry for this provider.
 * @param {string[]} [blacklist] Terms to filter listings out by.
 * @returns {ProviderConfig} A configuration usable by a single pipeline run.
 */
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});
export const metaInformation = {
  countries: ['de'],
  name: 'McMakler',
  baseUrl: 'https://www.mcmakler.de/immobilien/',
  id: 'mcMakler',
};
export { config };
