/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The provider config of a portal on the platform immowelt and SeLoger share.
 *
 * The two portals are one application (see `site.js`): the same search model, the same search BFF
 * behind the same DataDome wall, the same card and exposé. So their configs are one config over a
 * different set of sites, built here once - the way `buildImmoscoutProvider` builds ImmoScout's two
 * - rather than copied into each provider, where every change to it would have to land twice.
 *
 * What differs is only which sites a provider may search, and what else it refuses: SeLoger's
 * landing pages keep their search in the path, where the search model cannot read it.
 */

import { isOneOf } from '../../utils.js';
import logger from '../logger.js';
import { convertSearchUrlToRequest } from './immowelt-search-model.js';
import { fetchResultPageHtml, probeExpose, searchClassifieds } from './immoweltBff.js';
import { readSearchResults } from './embeddedState.js';
import { requireSite } from './site.js';
import {
  CLASSIFIED_CRAWL_FIELDS,
  fetchClassifiedByUrl,
  fetchClassifiedDetails,
  normalizeClassified,
  probeClassifiedPrice,
} from './classified.js';
import { queryPageUrl } from '../../utils/pageUrl.js';
/** @import { ParsedListing } from '../../types/listing.js' */
/** @import { ProviderConfig } from '../../types/providerConfig.js' */

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

/**
 * How many cards one result page carries.
 *
 * The BFF search is asked for the same number when it stands in for the result page, so that page N
 * means the same listings on either path: a run whose second page fell back to a 100-card BFF page
 * would skip cards 31 to 100.
 */
const RESULT_PAGE_SIZE = 30;

/**
 * Build the config of one of the platform's portals.
 *
 * @param {string} provider the Fredy provider the config belongs to, `immowelt` or `seloger`
 * @param {{refuseUrl?: (url: string) => void, readsResultPage?: boolean}} [options] `refuseUrl`
 *   throws for a url on one of the provider's own sites that it still cannot search;
 *   `readsResultPage` searches by reading the result page, with the BFF search as the fallback,
 *   instead of asking the BFF alone
 * @returns {{config: ProviderConfig, createConfig: (sourceConfig: {url: string, enabled?: boolean}, blacklist?: string[]) => ProviderConfig}}
 */
export function buildClassifiedProvider(provider, { refuseUrl, readsResultPage = false } = {}) {
  /**
   * Fetch one page of listings from the site the url is on.
   *
   * The site is resolved first, so that a url on another portal - which the shared BFF would search
   * without complaint - is named as the wrong site rather than stored under the wrong provider, and
   * a stranger's url is not reported as whatever the search model makes of its query string.
   *
   * A provider that reads the result page asks the BFF only when the page carries nothing Fredy can
   * read: a page still stuck at the device check, a search the platform says failed, or markup that
   * has changed. The fallback is logged, because it is the one sign that the page path is broken.
   *
   * @param {string} url the job's search url, already sorted by date via `sortByDateParam`
   * @param {import('puppeteer').Browser} browser the shared browser of the current job run
   * @returns {Promise<any[]>} the raw classifieds of the result page the url names
   */
  async function getListings(url, browser) {
    const site = requireSite(url, provider);
    refuseUrl?.(url);
    if (!readsResultPage) {
      return searchClassifieds(browser, convertSearchUrlToRequest(url), site);
    }

    const classifieds = readSearchResults(await fetchResultPageHtml(browser, url, site));
    if (classifieds != null) return classifieds;

    logger.warn(`${site.host} result page carried no listings Fredy can read; asking the search api instead.`);
    return searchClassifieds(browser, convertSearchUrlToRequest(url, { size: RESULT_PAGE_SIZE }), site);
  }

  /** @type {ProviderConfig} */
  const config = {
    requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
    url: null,
    crawlFields: CLASSIFIED_CRAWL_FIELDS,
    sortByDateParam: 'order=DateDesc',
    // The search model reads `page` into the BFF request's `paging.page`.
    pageUrl: queryPageUrl('page'),
    // ?priceMin=500&priceMax=1000 - the same two names the search model passes through to the BFF.
    priceRangeParams: { min: 'priceMin', max: 'priceMax' },
    normalize: normalizeClassified,
    getListings,
    fetchDetails: fetchClassifiedDetails,
    // A pasted exposé, read through the same session as the detail fetch, and only on this
    // provider's own sites.
    fetchListingByUrl: (url, browser) => fetchClassifiedByUrl(provider, url, browser),
    // Both asked from inside the session: a plain request, and a freshly rendered page, meet the
    // DataDome wall whatever the advert's state.
    browserActivityProbe: (link, browser) => probeExpose(browser, link),
    priceTracking: { browserProbe: probeClassifiedPrice },
  };

  /**
   * Build a run-scoped provider configuration.
   *
   * Returns a fresh object on every call instead of mutating shared state. Two jobs can be in flight
   * at once - a manual run started while the scheduler is working through the others - and a shared
   * mutable config meant the second job overwrote the first job's url and blacklist mid-run, so
   * listings were fetched for one job and stored under another.
   *
   * @param {{url: string, enabled?: boolean}} sourceConfig The job's entry for this provider.
   * @param {string[]} [blacklist] Terms to filter listings out by.
   * @returns {ProviderConfig} A configuration usable by a single pipeline run.
   */
  const createConfig = (sourceConfig, blacklist = []) => ({
    ...config,
    enabled: sourceConfig.enabled,
    url: sourceConfig.url,
    filter: (listing) => applyBlacklist(listing, blacklist ?? []),
  });

  return { config, createConfig };
}
