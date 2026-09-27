/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * leboncoin, France's largest classifieds site and the portal with the most property adverts in the
 * country - private landlords above all, who rarely pay for a place on the specialist portals.
 *
 * Read through `finder/search`, the endpoint the site's own search page posts to, asked from a
 * browser page on www.leboncoin.fr (see `services/leboncoin/finder.js` for why nothing else gets
 * past DataDome). The url is translated into the endpoint's body by `search-model.js`, following
 * the site's own rules, so any filter the site offers reaches the endpoint whether or not Fredy has
 * heard of it.
 *
 * The search answer is complete: description, attributes, location and photos, so there is no
 * detail enrichment. There is no price tracking either. The one place the current price could be
 * read without a browser is the advert page, and that page is behind the same wall - asking it for
 * every stored listing would spend the session the searches depend on.
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { wallClockInZone } from '../utils/publicationDate.js';
import { normalizeEnergyClass } from '../utils/buildingFacts.js';
import { convertSearchUrlToBody, LEBONCOIN_ORIGIN, parseRange } from '../services/leboncoin/search-model.js';
import { searchAds } from '../services/leboncoin/finder.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

/** The zone leboncoin writes its timestamps in, without saying so. */
const LEBONCOIN_TIME_ZONE = 'Europe/Paris';

/** `2026-08-26 03:01:21`, the only shape the endpoint writes a date in. */
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;

/**
 * The advert's attributes, by key. The endpoint answers them as a list of `{key, value,
 * value_label}`, where `value` is the machine reading ("2") and `value_label` the one shown ("2
 * pièces", "Oui").
 *
 * @param {any} ad a raw advert
 * @returns {Record<string, string>}
 */
function readAttributes(ad) {
  /** @type {Record<string, string>} */
  const attributes = {};
  for (const attribute of Array.isArray(ad?.attributes) ? ad.attributes : []) {
    if (typeof attribute?.key === 'string' && attribute.value != null)
      attributes[attribute.key] = String(attribute.value);
  }
  return attributes;
}

/**
 * @param {unknown} value
 * @returns {number|null} a positive figure, or null
 */
function figure(value) {
  const number = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * The price, as Fredy means it: the rent without charges for a rental, the price for a sale.
 *
 * A French rent is quoted *charges comprises*, and so is the endpoint's `price`. Everything
 * downstream reads a rent as the one without them - the affordability check adds the running costs
 * itself - so the advertiser's `rent_excluding_charges` wins where they stated it, and the monthly
 * charges are subtracted where they only stated those. An advert that says its rent excludes the
 * charges already is taken at its word.
 *
 * @param {any} ad a raw advert
 * @param {Record<string, string>} attributes its attributes
 * @returns {number|null}
 */
export function readPrice(ad, attributes = readAttributes(ad)) {
  const price = figure(Array.isArray(ad?.price) ? ad.price[0] : ad?.price);
  // `1` is "Oui", `2` is "Non"; only a rental carries the attribute at all.
  if (price == null || attributes.charges_included !== '1') return price;

  const withoutCharges = figure(attributes.rent_excluding_charges);
  if (withoutCharges != null && withoutCharges <= price) return withoutCharges;

  const charges = figure(attributes.monthly_charges);
  return charges != null && charges < price ? price - charges : price;
}

/**
 * What the rent {@link readPrice} settled on is: with the charges in it or without, and what they
 * come to where the advert says or the difference to the rent it quoted does.
 *
 * @param {any} ad a raw advert
 * @param {Record<string, string>} attributes its attributes
 * @param {number|null} price what `readPrice` answered
 * @returns {{chargesIncluded?: boolean, charges?: number}} nothing for a sale
 */
function readRentBasis(ad, attributes, price) {
  if (price == null || attributes.charges_included == null) return {};

  const stated = figure(attributes.monthly_charges);
  if (attributes.charges_included !== '1') {
    return { chargesIncluded: false, ...(stated != null ? { charges: stated } : {}) };
  }

  const quoted = figure(Array.isArray(ad?.price) ? ad.price[0] : ad?.price);
  if (quoted != null && price < quoted) {
    return { chargesIncluded: false, charges: stated ?? Math.round((quoted - price) * 100) / 100 };
  }
  return { chargesIncluded: true };
}

/**
 * The first publication, read as the Paris wall clock it is written in.
 *
 * `first_publication_date` rather than `index_date`: the index date moves every time an advert is
 * bumped back to the top of the list, and a flat that has been on the market for a month is not
 * newly published because its owner paid for another round of visibility.
 *
 * @param {unknown} value
 * @returns {number|undefined}
 */
function readPublicationDate(value) {
  const match = typeof value === 'string' ? WALL_CLOCK.exec(value) : null;
  if (match == null) return undefined;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  return wallClockInZone({ year, month, day, hour, minute, second }, LEBONCOIN_TIME_ZONE);
}

/**
 * The address line: the district when leboncoin names one, then the postcode and the town.
 *
 * @param {any} location the advert's `location`
 * @returns {string}
 */
function buildAddress(location) {
  const town = [location?.zipcode, location?.city].filter(Boolean).join(' ');
  const district = typeof location?.district === 'string' ? location.district.trim() : '';
  const address = [district, town].filter(Boolean).join(', ');
  return address || 'NO ADDRESS FOUND';
}

/**
 * The advert's point on the map: its street where the advertiser gave one, the middle of its
 * district or its town where they did not - never further off than geocoding the address line
 * would be, and without spending a lookup on it.
 *
 * @param {any} location the advert's `location`
 * @returns {{latitude?: number, longitude?: number}}
 */
function readPosition(location) {
  const latitude = location?.lat;
  const longitude = location?.lng;
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : {};
}

/**
 * @param {any} ad a raw advert from `finder/search`
 * @returns {ParsedListing}
 */
function normalize(ad) {
  const attributes = readAttributes(ad);
  const price = readPrice(ad, attributes);
  const id = ad?.list_id == null ? null : String(ad.list_id);

  return {
    id: buildHash(id, price == null ? null : String(price)),
    link: ad?.url ?? (id == null ? null : `${LEBONCOIN_ORIGIN}/ad/${id}`),
    title: typeof ad?.subject === 'string' ? ad.subject.trim() : null,
    price,
    ...readRentBasis(ad, attributes, price),
    size: figure(attributes.square),
    rooms: figure(attributes.rooms),
    address: buildAddress(ad?.location),
    image: ad?.images?.urls_large?.[0] ?? ad?.images?.urls?.[0] ?? ad?.images?.small_url ?? null,
    description: typeof ad?.body === 'string' ? ad.body : null,
    publishedAt: readPublicationDate(ad?.first_publication_date),
    energyClass: normalizeEnergyClass(attributes.energy_rate),
    ...readPosition(ad?.location),
  };
}

/**
 * @param {string} url the job's search url
 * @param {import('puppeteer').Browser} browser the shared browser of the current job run
 * @returns {Promise<any[]>}
 */
async function getListings(url, browser) {
  return searchAds(browser, convertSearchUrlToBody(url));
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
  // Not selectors: the adverts are JSON, and these are the fields of one of them.
  crawlFields: {
    id: 'list_id',
    title: 'subject',
    price: 'attributes.rent_excluding_charges, or price - monthly_charges (rentals) / price (sales)',
    size: 'attributes.square',
    rooms: 'attributes.rooms',
    address: 'location.district + zipcode + city',
    image: 'images.urls_large[0]',
    link: 'url',
    description: 'body',
  },
  // The site's own "newest first". The body is built from the url, so this is what the search asks.
  sortByDateParam: 'sort=time&order=desc',
  // ?price=500-1000, both bounds in one parameter, either end open: `min-1000`, `500-max`. Read by
  // the search model's own range parser, so the band reported is the one the search sends - a value
  // it does not take for a range goes out as an enum and bounds nothing.
  priceRangeParams: {
    parse: (url) => {
      const range = parseRange((new URL(url).searchParams.get('price') ?? '').trim());
      return { min: range?.min ?? null, max: range?.max ?? null };
    },
  },
  normalize,
  getListings,
  activityProbe: checkIfListingIsActive,
};

/**
 * Build a run-scoped provider configuration.
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
  countries: ['fr'],
  name: 'leboncoin',
  baseUrl: `${LEBONCOIN_ORIGIN}/`,
  id: 'leboncoin',
};

export { config };
