/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Deutsche Wohnen provider using the site's JSON API to retrieve listings.
 *
 * Users paste a search URL from https://www.deutsche-wohnen.com/mieten/mietangebote
 * which is translated to the internal API endpoint:
 * GET /api/deuwo-real-estate/list?{search parameters}
 *
 * Detail pages are server-rendered and embed structured listing data in the
 * `data-vonovia-data` attribute, which is parsed during fetchDetails().
 */

import { buildHash, isOneOf } from '../utils.js';
import logger from '../services/logger.js';
import { extractNumber } from '../utils/extract-number.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

/**
 * The largest page the list endpoint is willing to serve.
 *
 * Asking for more is not trimmed down but refused: the endpoint answers `406 Not Acceptable` with
 * an empty body, which reads exactly like being blocked by a bot filter. The provider used to ask
 * for 100 in one go, so every search broke the day the cap appeared.
 */
const API_MAX_LIMIT = 50;

/**
 * How many pages one run may walk before giving up.
 *
 * A stop condition that depends on the endpoint agreeing with itself - `paging.info.count` against
 * the rows actually returned - is one malformed response away from looping forever. At the cap
 * this still covers 500 listings, far more than any single search returns.
 */
const MAX_PAGES = 10;

/**
 * A page size the endpoint accepts, whatever the pasted URL asked for.
 *
 * @param {string|null} requested
 * @returns {string}
 */
function clampLimit(requested) {
  const limit = Number.parseInt(requested ?? '', 10);
  return String(Number.isFinite(limit) && limit > 0 ? Math.min(limit, API_MAX_LIMIT) : API_MAX_LIMIT);
}

/**
 * Translates a Deutsche Wohnen search page URL into the JSON API endpoint.
 *
 * @param {string} url Web search URL or API URL pasted by the user.
 * @returns {string} API URL used by getListings().
 */
export function convertWebToApi(url) {
  const parsed = new URL(url);

  if (parsed.pathname === '/api/deuwo-real-estate/list') {
    // An API URL is passed through as pasted, but not its page size: a `limit` over the cap is
    // answered with a 406 and would leave the job with no listings at all.
    parsed.searchParams.set('limit', clampLimit(parsed.searchParams.get('limit')));
    return parsed.toString();
  }

  const params = parsed.searchParams;
  params.delete('scroll');
  params.set('limit', clampLimit(params.get('limit')));
  params.set('dataSet', params.get('dataSet') || 'deuwo');

  for (const key of ['parkingCarport', 'parkingStellplatz', 'parkingGarage', 'parkingTiefgarage']) {
    if (!params.has(key)) {
      params.set(key, '0');
    }
  }

  return `${metaInformation.baseUrl}api/deuwo-real-estate/list?${params.toString()}`;
}

/**
 * @param {any} item
 * @returns {string}
 */
function buildAddress(item) {
  const street = item.strasse?.trim();
  const cityLine = [item.plz, item.ort].filter(Boolean).join(' ').trim();
  return [street, cityLine].filter(Boolean).join(', ');
}

/**
 * @param {number | null | undefined} value
 * @returns {number | null}
 */
function normalizeCoordinate(value) {
  if (value == null || value === 0) {
    return null;
  }
  return value;
}

/**
 * @param {any} detailData
 * @returns {string}
 */
function buildDescription(detailData) {
  const parts = [];

  if (detailData.description?.trim()) {
    parts.push(`Beschreibung\n${detailData.description.trim()}`);
  }

  if (detailData.features?.length) {
    parts.push(
      `Ausstattung\n${detailData.features
        .map((f) => f.trim())
        .filter(Boolean)
        .join('\n')}`,
    );
  }

  if (detailData.location?.trim()) {
    parts.push(`Lage\n${detailData.location.trim()}`);
  }

  const sectionText = (detailData.sections || [])
    .map((section) => {
      const rows = (section.rows || [])
        .filter((row) => row.label && row.value)
        .map((row) => `${row.label}: ${row.value}`)
        .join('\n');
      if (!rows) return null;
      return [section.heading, rows].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');

  if (sectionText) {
    parts.push(sectionText);
  }

  if (detailData.miscellaneous?.trim()) {
    parts.push(detailData.miscellaneous.trim());
  }

  return parts.join('\n\n').trim();
}

/**
 * Fetch the listing rows from the Deutsche Wohnen JSON API.
 *
 * Invoked by the pipeline with `this` bound to the executioner, so the run's own configuration -
 * and with it the search URL the user pasted - is reachable via `this._providerConfig`. The referer
 * is read from there rather than from module state, so two jobs running at the same time cannot
 * send each other's referer.
 *
 * @this {{_providerConfig?: {refererUrl?: string|null}}}
 * @param {string} url The API URL to query.
 * @returns {Promise<any[]>}
 */
async function getListings(url) {
  const refererUrl = this?._providerConfig?.refererUrl ?? null;
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    Accept: 'application/json',
    ...(refererUrl ? { Referer: refererUrl } : {}),
  };

  const pageSize = Number.parseInt(new URL(url).searchParams.get('limit') ?? '', 10) || API_MAX_LIMIT;
  const rows = [];

  // The cap is well below what a city-wide search returns - Berlin alone is over it - so the pages
  // past the first are walked with `offset` rather than left behind. `paging.info.count` is the
  // size of the whole result set, so the first response already says how much is still missing.
  for (let page = 0; page < MAX_PAGES; page++) {
    const pageUrl = new URL(url);
    if (page > 0) {
      pageUrl.searchParams.set('offset', String(page * pageSize));
    }

    const response = await fetch(pageUrl.toString(), { method: 'GET', headers });
    if (!response.ok) {
      logger.error('Error fetching data from Deutsche Wohnen API:', response.statusText);
      break;
    }

    const responseBody = await response.json();
    const results = responseBody.results || [];
    rows.push(...results);

    const total = responseBody?.paging?.info?.count;
    if (results.length === 0 || total == null || rows.length >= total) {
      break;
    }
  }

  return rows
    .filter((item) => item.vermarktungsart_miete === '1')
    .map((item) => ({
      id: item.wrk_id,
      price: item.preis,
      size: item.groesse,
      rooms: item.anzahl_zimmer,
      title: item.titel,
      link: `${metaInformation.baseUrl}mieten/mietangebote/${item.slug}`,
      address: buildAddress(item),
      image: item.preview_img_url,
      latitude: item.lat,
      longitude: item.lng,
    }));
}

/**
 * @param {ParsedListing} listing
 * @param {any} [browser]
 * @returns {Promise<ParsedListing>}
 */
async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, 'body', { browser, name: 'deutscheWohnen_details' });
    if (!html) return listing;

    const $ = cheerio.load(html);
    const rawData = $('[data-vonovia-data]').attr('data-vonovia-data');
    if (!rawData) return listing;

    const detailData = JSON.parse(rawData);
    const description = buildDescription(detailData);
    const address = [detailData.streetAndHouseNumber, detailData.postCodeAndCity].filter(Boolean).join(', ');

    return {
      ...listing,
      address: address || listing.address,
      description: description || listing.description,
      latitude: normalizeCoordinate(detailData.latitude) ?? listing.latitude,
      longitude: normalizeCoordinate(detailData.longitude) ?? listing.longitude,
    };
  } catch (error) {
    logger.warn(`Could not fetch Deutsche Wohnen detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const id = buildHash(o.id, o.price);
  const price = extractNumber(o.price);
  return {
    id,
    link: o.link,
    title: (o.title || '').trim(),
    price: price != null ? Math.round(price) : null,
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address: o.address,
    image: o.image,
    description: o.description,
    latitude: normalizeCoordinate(o.latitude),
    longitude: normalizeCoordinate(o.longitude),
  };
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
  crawlFields: {
    id: 'wrk_id',
    title: 'titel',
    price: 'preis',
    size: 'groesse',
    rooms: 'anzahl_zimmer',
    link: 'slug',
    address: 'strasse',
    image: 'preview_img_url',
  },
  normalize,
  getListings,
  fetchDetails,
  // This provider had no probe at all, so the alive-checker skipped it with a warning and its
  // listings stayed active forever. Deutsche Wohnen answers 404 for a withdrawn offer, which is all
  // the shared probe needs.
  activityProbe: checkIfListingIsActive,
  priceTracking: {
    /**
     * The listing page embeds the same record the search API returns, so `rent` here is the field
     * behind the list's `preis`. `warmRent` sits right beside it and is the trap: reading it would
     * report an invented increase for every Deutsche Wohnen listing on the first probe.
     *
     * @param {string} html
     * @returns {number|null}
     */
    extract: (html) => {
      const raw = cheerio.load(html)('[data-vonovia-data]').first().attr('data-vonovia-data');
      if (!raw) return null;
      try {
        const data = JSON.parse(raw);
        return data?.rent ?? data?.purchasePrice ?? null;
      } catch {
        return null;
      }
    },
  },
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
  url: convertWebToApi(sourceConfig.url),
  refererUrl: sourceConfig.url,
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});

export const metaInformation = {
  countries: ['de'],
  name: 'Deutsche Wohnen',
  baseUrl: 'https://www.deutsche-wohnen.com/',
  id: 'deutscheWohnen',
};

export { config };
