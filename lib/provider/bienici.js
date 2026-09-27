/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Bien'ici provider, reading the JSON endpoints the site's own result page reads.
 *
 * Bien'ici is the portal France's agency networks founded together, and its result page renders
 * nothing on the server: the page translates its url into a `filters` object and asks
 * `realEstateAds.json` for the adverts. Fredy does the same translation (`search-model.js`) and
 * asks the same endpoint, so a run costs a single search - plus one place lookup per place the url
 * names, once a day - and needs no browser at all.
 *
 * Everything a notification needs is in the search answer already - the full description, the
 * photos, the figures, and a point on the map - so there is no detail enrichment. The one extra
 * request per listing is the activity and price probe, which asks the advert's own endpoint.
 */

import { buildHash, isOneOf } from '../utils.js';
import { publicationDate } from '../utils/publicationDate.js';
import { normalizeBuildYear, normalizeEnergyClass } from '../utils/buildingFacts.js';
import { toPlainText } from '../utils/plain-text.js';
import { BIENICI_ORIGIN, parseSearchUrl } from '../services/bienici/search-model.js';
import { fetchAd, resolveZoneIds, searchAds } from '../services/bienici/api.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

/**
 * The advert id at the end of a link. The site writes long links
 * (`/annonce/location/paris-7e/appartement/2pieces/<id>`) and resolves the short one Fredy stores
 * (`/annonce/<id>`) to the same page, so both are read.
 */
const AD_ID_IN_LINK = /\/annonce\/(?:[^?#]*\/)?([^/?#]+)\/?(?:[?#].*)?$/;

/** What a listing without a headline is called, by the endpoint's property type. */
const PROPERTY_LABELS = {
  flat: 'Appartement',
  house: 'Maison',
  loft: 'Loft',
  castle: 'Château',
  townhouse: 'Hôtel particulier',
  terrain: 'Terrain',
  parking: 'Parking',
  building: 'Immeuble',
  office: 'Bureau',
  premises: 'Local',
  shop: 'Commerce',
  programme: 'Programme neuf',
};

/**
 * @param {string} id the advert's id
 * @returns {string} the link Fredy stores for it
 */
function adLink(id) {
  return `${BIENICI_ORIGIN}/annonce/${encodeURIComponent(id)}`;
}

/**
 * A figure the endpoint gives, or null where it gives none.
 *
 * A new-build programme is a range of flats rather than one, and the endpoint answers its price,
 * area and room count as `[smallest, largest]`. The smallest is what the programme is advertised
 * with, so that is the one read.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function figure(value) {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'number' && Number.isFinite(first) && first > 0 ? first : null;
}

/**
 * The price, as Fredy means it: the rent without charges for a rental, the price for a sale.
 *
 * French adverts quote a rent *charges comprises*: the endpoint's `price` is the 2 450 € the page
 * shows, and 285 € of it are `charges`. Fredy reads a rent as the one without them - the
 * affordability check adds the running costs itself - so a warm figure would count the charges
 * twice.
 *
 * `rentWithoutCharges` is the advertiser's own statement of it and wins where it exists. On a
 * rent-controlled advert it is only the capped base rent, though: the complément de loyer the
 * landlord may charge on top of the cap sits in `rentExtra`, and it is rent the tenant pays every
 * month like the rest - the recorded advert immo-facile-61560389 asks 5 067 € plus 433 € of it,
 * and takes a deposit of 5 500 €. So the two are added up. A statement that comes out above the rent
 * charges included cannot be the rent without them, and is passed over.
 *
 * Without it the charges are subtracted, as long as they are smaller than the rent - a figure that
 * is not cannot be the monthly charges of that rent, and the headline is safer than a guess.
 *
 * @param {any} ad a raw advert
 * @returns {number|null}
 */
export function readPrice(ad) {
  const price = figure(ad?.price);
  if (price == null || ad?.adType !== 'rent') return price;

  const baseRent = figure(ad?.rentWithoutCharges);
  if (baseRent != null) {
    const withoutCharges = roundCents(baseRent + (figure(ad?.rentExtra) ?? 0));
    if (withoutCharges <= price) return withoutCharges;
  }

  const charges = figure(ad?.charges);
  return charges != null && charges < price ? roundCents(price - charges) : price;
}

/**
 * What the rent {@link readPrice} settled on is: without the charges where it took them out, and
 * what they come to; with them where it could not, since Bien'ici quotes every rent charges
 * comprises.
 *
 * @param {any} ad a raw advert
 * @param {number|null} price what `readPrice` answered
 * @returns {{chargesIncluded?: boolean, charges?: number}} nothing for a sale
 */
function readRentBasis(ad, price) {
  if (price == null || ad?.adType !== 'rent') return {};

  const quoted = figure(ad?.price);
  if (quoted != null && price < quoted) {
    return { chargesIncluded: false, charges: figure(ad?.charges) ?? roundCents(quoted - price) };
  }
  return { chargesIncluded: true };
}

/**
 * @param {number} value an amount in euros
 * @returns {number} the amount to the cent, without the float noise of adding two of them
 */
function roundCents(value) {
  return Math.round(value * 100) / 100;
}

/**
 * The address line: the neighbourhood when Bien'ici names one, then the postcode and the town.
 *
 * Bien'ici never hands out a street - an advert's exact position is blurred into a disk on the
 * map - so this is the most precise line there is. The point itself is stored as coordinates, see
 * {@link readPosition}, which is what spares the geocoder a guess at a neighbourhood's name.
 *
 * @param {any} ad a raw advert
 * @returns {string}
 */
function buildAddress(ad) {
  const town = [ad?.postalCode, ad?.city].filter(Boolean).join(' ');
  const neighbourhood = typeof ad?.district?.libelle === 'string' ? ad.district.libelle.trim() : '';
  const address = [neighbourhood, town].filter(Boolean).join(', ');
  return address || 'NO ADDRESS FOUND';
}

/**
 * The advert's point on the map. For an advert that hides its address this is the centre of the
 * disk it is blurred into, a few hundred metres at most from the door - still far closer than a
 * geocoded neighbourhood name would get.
 *
 * @param {any} ad a raw advert
 * @returns {{latitude?: number, longitude?: number}}
 */
function readPosition(ad) {
  const position = ad?.blurInfo?.position;
  const latitude = position?.lat;
  const longitude = position?.lon;
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : {};
}

/**
 * @param {any} ad a raw advert
 * @returns {string}
 */
function buildTitle(ad) {
  const headline = typeof ad?.title === 'string' ? ad.title.trim() : '';
  if (headline) return headline;

  const rooms = figure(ad?.roomsQuantity);
  const area = figure(ad?.surfaceArea);
  return [
    PROPERTY_LABELS[ad?.propertyType] ?? 'Bien',
    rooms != null ? `${rooms} pièce${rooms > 1 ? 's' : ''}` : null,
    area != null ? `${area} m²` : null,
    ad?.city,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * @param {any} ad a raw advert from `realEstateAds.json` or `realEstateAd.json`
 * @returns {ParsedListing}
 */
function normalize(ad) {
  const price = readPrice(ad);
  const id = ad?.id == null ? null : String(ad.id);

  return {
    id: buildHash(id, price == null ? null : String(price)),
    link: id == null ? null : adLink(id),
    title: buildTitle(ad),
    price,
    ...readRentBasis(ad, price),
    size: figure(ad?.surfaceArea),
    rooms: figure(ad?.roomsQuantity),
    address: buildAddress(ad),
    image: ad?.photos?.[0]?.url ?? null,
    // The endpoint writes line breaks as `<br>` and paragraphs as `<p>`; kept apart, so a blacklist
    // term at the start of one is not glued to the end of the one before.
    description: toPlainText(ad?.description) || null,
    publishedAt: publicationDate(ad?.publicationDate),
    buildYear: normalizeBuildYear(ad?.yearOfConstruction),
    energyClass: normalizeEnergyClass(ad?.energyClassification),
    ...readPosition(ad),
  };
}

/**
 * Read the adverts of a search: resolve its places, then ask for the newest page.
 *
 * @param {string} url the job's search url
 * @returns {Promise<any[]>}
 */
async function getListings(url) {
  const search = parseSearchUrl(url);
  const zoneIds = await resolveZoneIds(search.places, url);
  return searchAds(search, zoneIds);
}

/**
 * Ask the advert's own endpoint about a stored listing.
 *
 * The advert page is no use for this: it is the same application shell for any id at all, and
 * only its own JavaScript finds out otherwise. The endpoint answers 404 for an advert that is gone,
 * and `status.onTheMarket: false` for one its advertiser has closed but not yet removed.
 *
 * @param {string} link the stored listing's link
 * @returns {Promise<{active: number, ad: any|null}>} `active` is 1, 0 or -1 as the probes report
 *   it; `ad` is the payload when there was one, so the price probe does not ask twice.
 */
async function probeAd(link) {
  const id = AD_ID_IN_LINK.exec(link ?? '')?.[1];
  if (id == null) return { active: -1, ad: null };

  try {
    const { status, ad } = await fetchAd(decodeURIComponent(id));
    if (status === 404 || status === 410) return { active: 0, ad: null };
    if (ad == null) return { active: -1, ad: null };
    return { active: ad.status?.onTheMarket === false ? 0 : 1, ad };
  } catch {
    // A timeout or a refused connection says nothing about the advert.
    return { active: -1, ad: null };
  }
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
  // Not selectors: the adverts are JSON, and these are the fields of one of them. Kept because it
  // is the one place the mapping is written down in full.
  crawlFields: {
    id: 'id',
    title: 'title',
    price: 'rentWithoutCharges + rentExtra, or price - charges (rentals) / price (sales)',
    size: 'surfaceArea',
    rooms: 'roomsQuantity',
    address: 'district.libelle + postalCode + city',
    image: 'photos[0].url',
    description: 'description',
  },
  // The page's own spelling of "newest first". The request always sorts that way whatever the url
  // says; this is what keeps the stored url opening on the same order in the browser.
  sortByDateParam: 'tri=publication-desc',
  // ?prix-min=500&prix-max=1000
  priceRangeParams: { min: 'prix-min', max: 'prix-max' },
  normalize,
  getListings,
  activityProbe: async (link) => (await probeAd(link)).active,
  priceTracking: {
    /**
     * The same figure the search stored, read off the advert's endpoint through the same
     * {@link readPrice}: reading the warm rent here would report every rental as a price change on
     * its first probe.
     *
     * @param {{link: string}} listing
     * @returns {Promise<number|null>}
     */
    probe: async (listing) => {
      const { ad } = await probeAd(listing?.link);
      return ad == null ? null : readPrice(ad);
    },
  },
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
  name: "Bien'ici",
  baseUrl: `${BIENICI_ORIGIN}/`,
  id: 'bienici',
};

export { config };
