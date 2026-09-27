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
import { convertSearchUrlToRequest } from './immowelt-search-model.js';
import { probeExpose, searchClassifieds } from './immoweltBff.js';
import { requireSite } from './site.js';
import {
  CLASSIFIED_CRAWL_FIELDS,
  fetchClassifiedDetails,
  normalizeClassified,
  probeClassifiedPrice,
} from './classified.js';
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
 * Build the config of one of the platform's portals.
 *
 * @param {string} provider the Fredy provider the config belongs to, `immowelt` or `seloger`
 * @param {{refuseUrl?: (url: string) => void}} [options] `refuseUrl` throws for a url on one of the
 *   provider's own sites that it still cannot search
 * @returns {{config: ProviderConfig, createConfig: (sourceConfig: {url: string, enabled?: boolean}, blacklist?: string[]) => ProviderConfig}}
 */
export function buildClassifiedProvider(provider, { refuseUrl } = {}) {
  /**
   * Fetch one page of listings through the search BFF of the site the url is on.
   *
   * The site is resolved first, so that a url on another portal - which the shared BFF would search
   * without complaint - is named as the wrong site rather than stored under the wrong provider, and
   * a stranger's url is not reported as whatever the search model makes of its query string.
   *
   * @param {string} url the job's search url, already sorted by date via `sortByDateParam`
   * @param {import('puppeteer').Browser} browser the shared browser of the current job run
   * @returns {Promise<any[]>} the raw classifieds of the first result page
   */
  async function getListings(url, browser) {
    const site = requireSite(url, provider);
    refuseUrl?.(url);
    return searchClassifieds(browser, convertSearchUrlToRequest(url), site);
  }

  /** @type {ProviderConfig} */
  const config = {
    requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
    url: null,
    crawlFields: CLASSIFIED_CRAWL_FIELDS,
    sortByDateParam: 'order=DateDesc',
    // ?priceMin=500&priceMax=1000 - the same two names the search model passes through to the BFF.
    priceRangeParams: { min: 'priceMin', max: 'priceMax' },
    normalize: normalizeClassified,
    getListings,
    fetchDetails: fetchClassifiedDetails,
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
