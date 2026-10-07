/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Translates a Bien'ici search url into the filters its `realEstateAds.json` endpoint takes.
 *
 * Bien'ici's result page is a single page application: the html carries no adverts, and the page
 * builds its request from the url in the browser. The url and the request are two spellings of the
 * same search object, and the rules between them are copied here from the site's own url parser
 * (`UrlFormatter`, `UrlQueryHelper` and the query name table next to them in `commonModern.js`):
 *
 *   /recherche/location/paris-75000/appartement/2-pieces-et-plus?prix-max=2000&surface-min=30
 *   → {filterType: 'rent', propertyType: ['flat'], minRooms: 2, maxPrice: 2000, minArea: 30}
 *     searched in the zones `paris-75000` resolves to
 *
 * Only the places need the network: the path names them by slug, and the endpoint searches by zone
 * id, so {@link parseSearchUrl} hands back the slugs and `api.js` asks Bien'ici's own place lookup
 * for their ids, the same lookup the page makes.
 *
 * A query parameter this translator does not know is a hard error rather than a warning, for the
 * reason the immowelt translator gives: every parameter the site writes into a search url is a
 * filter the user set, and dropping one hands back a search wider than the one that was saved.
 *
 * @see lib/services/bienici/api.js for the requests this feeds.
 */

import { isCampaignParam } from '../../utils/campaignParams.js';
import { slugify } from '../../utils/slugify.js';

/** The site every search url and every advert link is on. */
export const BIENICI_ORIGIN = 'https://www.bienici.com';

/**
 * How many adverts one request asks for. The page asks for 24; the endpoint answers 100 without
 * complaint, which covers everything a job interval can plausibly have missed.
 */
export const DEFAULT_PAGE_SIZE = 100;

/** The path every search url starts with. */
const SEARCH_PATH = /^\/recherche(?=\/|$)/;

/** The deal types, as the first path segment spells them. Several are joined by commas. */
const FILTER_TYPES = { achat: 'buy', location: 'rent' };

/**
 * Property type slugs, as the site's `PropertyTypes.FRENCH_SLUG_TO_DB` has them. `maison` and
 * `parkingbox` are the two older spellings the site still accepts next to the ones it writes.
 */
const PROPERTY_TYPES = {
  maisonvilla: 'house',
  maison: 'house',
  appartement: 'flat',
  parking: 'parking',
  parkingbox: 'parking',
  terrain: 'terrain',
  batiment: 'building',
  chateau: 'castle',
  loft: 'loft',
  bureau: 'office',
  local: 'premises',
  commerce: 'shop',
  hotel: 'townhouse',
  annexe: 'annexe',
  autres: 'others',
};

/**
 * What a search without a property type segment covers: the site's `DEFAULT_USER_SEARCH`, which is
 * every kind of home and nothing else - no plots, no parking spaces, no offices.
 */
const DEFAULT_PROPERTY_TYPES = ['house', 'flat', 'loft', 'castle', 'townhouse'];

/** Room segments, in the order the site tries them. */
const ROOMS_AT_LEAST = /^(\d+)-pi[èe]ces?-et-plus$/;
const ROOMS_AT_MOST = /^(\d+)-pi[èe]ces?-et-moins$/;
const ROOMS_BETWEEN = /^de-(\d+)-a-(\d+)-?pi[èe]ces?$/;
const ROOMS_EXACTLY = /^(\d+)-pi[èe]ces?$/;

/** Query parameters holding one number, by the filter name the endpoint knows them under. */
const NUMBER_PARAMS = {
  'prix-min': 'minPrice',
  'prix-max': 'maxPrice',
  'surface-min': 'minArea',
  'surface-max': 'maxArea',
  'chambres-min': 'minBedrooms',
  'chambres-max': 'maxBedrooms',
  'surface-terrain-min': 'minGardenSurfaceArea',
  'surface-terrain-max': 'maxGardenSurfaceArea',
};

/**
 * Query parameters holding a yes/no, by filter name, with the value "yes" stands for.
 *
 * Almost all of them mean `true`; the fibre filter is the exception, where "yes" is the deployment
 * status `deploye`. The url writes `oui` or `non`, and a pair such as `oui-non` for a filter that
 * accepts both - which the site reads as a list of the two, and so does this.
 */
const BOOLEAN_PARAMS = {
  'etat-neuf': ['newProperty', true],
  disponible: ['onTheMarket', true],
  'en-avant-premiere': ['isPreview', true],
  'dernier-etage': ['isOnLastFloor', true],
  'modelisation-3d': ['has3DModel', true],
  'rez-de-chaussee': ['isGroundFloor', true],
  'pas-au-rez-de-chaussee': ['isNotGroundFloor', true],
  piscine: ['hasPool', true],
  balcon: ['hasBalcony', true],
  terrasse: ['hasTerrace', true],
  'balcon-ou-terrasse': ['hasBalconyOrTerrace', true],
  cave: ['hasCellar', true],
  parking: ['hasParking', true],
  cheminee: ['hasFirePlace', true],
  digicode: ['hasDoorCode', true],
  interphone: ['hasIntercom', true],
  jardin: ['hasGarden', true],
  ascenseur: ['hasElevator', true],
  'avec-travaux': ['workToDo', true],
  'sans-travaux': ['noWorkToDo', true],
  'plain-pied': ['singleStoreyHouse', true],
  pmr: ['isDisabledPeopleFriendly', true],
  'colocation-autorisee': ['flatSharing', true],
  constructible: ['isBuildingPlot', true],
  exclusif: ['isExclusiveSaleMandate', true],
  gardien: ['hasCaretaker', true],
  duplex: ['isDuplex', true],
  'toilettes-separees': ['hasSeparateToilet', true],
  meuble: ['isFurnished', true],
  'non-meuble': ['isNotFurnished', true],
  photo: ['hasPhoto', true],
  'eligible-loi-denormandie': ['isEligibleForDenormandieLaw', true],
  multidiffusable: ['exportableAd', true],
  'residence-etudiants': ['isInStudentResidence', true],
  'residence-seniors': ['isInSeniorResidence', true],
  'residence-tourisme': ['isInTourismResidence', true],
  'residence-geree': ['isInManagedResidence', true],
  'pas-en-residence': ['isNotInResidence', true],
  'viagers-exclus': ['isNotLifeAnnuitySale', true],
  'viagers-uniquement': ['isLifeAnnuitySaleOnly', true],
  'nue-propriétés-exclus': ['isNotPropertyWithoutUsufruct', true],
  'nue-propriétés-uniquement': ['isPropertyWithoutUsufructOnly', true],
  neuf: ['isPromotedNewProperty', true],
  'annonces-sans-photo': ['hasNoPhoto', true],
  'annonces-sans-adresse': ['hasNoAddress', true],
  'annonces-avec-adresse': ['hasAddress', true],
  'annonces-sans-prix': ['hasNoPrice', true],
  'avant-premiere-bienici': ['isPromotedAsExclusive', true],
  'maisons-a-construire': ['hasToBeBuilt', true],
  'maisons-a-construire-exclues': ['hasNotToBeBuilt', true],
  fibre: ['opticalFiberStatus', 'deploye'],
  'recharge-vehicule-electrique': ['chargingStations', true],
};

/** Query parameters the endpoint takes as they are written, one string each. */
const TEXT_PARAMS = {
  // The polyline of a boundary the map was narrowed to, in the same encoding the endpoint takes.
  limite: 'limit',
  reference: 'reference',
  'a-la-une': 'isLeading',
  recommande: 'highlighted',
};

/** Query parameters holding a comma separated list. */
const LIST_PARAMS = { 'classification-energetique': 'energyClassification' };

/** Query parameters holding JSON. */
const JSON_PARAMS = { geocoding: 'geocoding' };

/** The one parameter whose url spelling is `D` for yes; the site keeps it for its agency tools. */
const EXCLUDE_AGENCY_NEW = '8';

/**
 * `recherche-etendue` is not a filter but a separate parameter of the request, and the endpoint
 * refuses the value the site calls "none" rather than accepting it - leaving it out is how a search
 * stays inside its area. So the only values passed on are the ones that ask for more.
 */
const EXTENSION_TYPES = {
  etendue: 'extended',
  'etendue-seulement': 'extendedOnly',
  'etendue-si-pas-de-resultat': 'extendedIfNoResult',
};
const NO_EXTENSION = 'non-etendue';

/**
 * Parameters that carry no search meaning: the page's view state (list or map, the map's camera,
 * the page number), the sort order - Fredy always asks for the newest first - and the markers the
 * site appends when it opens a dialog.
 */
const IGNORED_PARAMS = new Set([
  'mode',
  'carte',
  'camera',
  'page',
  'tri',
  'creer-une-alerte',
  'query-string',
  'nested-query-string',
  'contacts-nested-query-string',
]);

/** A place slug that names a delegated commune, which the place lookup is asked for by type. */
const DELEGATED_CITY_SUFFIX = /-associee$/;

/**
 * Location slugs that stand for a search area Bien'ici keeps on its own servers: a shape drawn on
 * the map (`dessin-<id>`), a circle (`cercle-<id>`) and a travel time (`temps-de-transport-<id>`).
 * The url carries nothing but the id, so there is nothing to search with.
 */
const UNSUPPORTED_AREA = /^(temps-de-transport|dessin|cercle)-/;

/**
 * The slug the site writes for "search this part of the map". Unlike the three above, the area is
 * in the url itself - as the `limite` polyline - so the place is simply dropped and the boundary
 * does the narrowing.
 */
const MAP_SECTION = /^zone-recherch(e|é)e$/;

/**
 * @typedef {Object} BieniciPlaceQuery
 * @property {string} slug The place as the url names it, e.g. `paris-75000`.
 * @property {string} q What the place lookup is asked for - the slug, less a `-associee` suffix.
 * @property {string} type The place types the lookup may answer with.
 */

/**
 * @typedef {Object} BieniciSearch
 * @property {Record<string, any>} filters Everything the request's `filters` carries except the
 *   zones, which only exist once the places are resolved.
 * @property {BieniciPlaceQuery[]} places The places the search is limited to. Empty for all of
 *   France.
 * @property {string|null} extensionType The request's `extensionType`, when the url asks for more
 *   than its own area.
 */

/**
 * Read `oui`, `non` or a dash-joined list of them, the way the site's `UrlQueryHelper` does.
 *
 * @param {string} value the raw query value
 * @param {any} yes what `oui` stands for
 * @returns {any} `yes`, its negation, or a list of both
 */
function parseYesNo(value, yes) {
  if (value === 'oui' || value === 'true') return yes;
  if (value.includes('-')) return value.split('-').map((part) => parseYesNo(part, yes));
  return !yes;
}

/**
 * Read the room count or the property types out of the path segments after the place.
 *
 * @param {string[]} segments the decoded segments after the place
 * @param {string} searchUrl the url, for the error message
 * @returns {{propertyType: string[], minRooms?: number, maxRooms?: number}}
 * @throws {Error} when a segment names a property type the site does not have
 */
function parseTrailingSegments(segments, searchUrl) {
  /** @type {{propertyType: string[], minRooms?: number, maxRooms?: number}} */
  const result = { propertyType: DEFAULT_PROPERTY_TYPES };

  for (const segment of segments) {
    if (!segment) continue;
    const between = ROOMS_BETWEEN.exec(segment);
    const atLeast = ROOMS_AT_LEAST.exec(segment);
    const atMost = ROOMS_AT_MOST.exec(segment);
    const exactly = ROOMS_EXACTLY.exec(segment);

    if (atLeast) {
      result.minRooms = Number(atLeast[1]);
    } else if (atMost) {
      result.maxRooms = Number(atMost[1]);
    } else if (between) {
      result.minRooms = Number(between[1]);
      result.maxRooms = Number(between[2]);
    } else if (exactly) {
      result.minRooms = Number(exactly[1]);
      result.maxRooms = Number(exactly[1]);
    } else if (segment === 'studio') {
      result.maxRooms = 1;
    } else {
      result.propertyType = parsePropertyTypes(segment, searchUrl);
    }
  }

  return result;
}

/**
 * @param {string} segment a comma separated list of property type slugs
 * @param {string} searchUrl the url, for the error message
 * @returns {string[]} the endpoint's names for them
 * @throws {Error} when one of them is unknown. The site would fall back to its default types for
 *   it, which is a different search from the one that was saved.
 */
function parsePropertyTypes(segment, searchUrl) {
  const slugs = segment.split(',').filter(Boolean);
  const unknown = slugs.filter((slug) => PROPERTY_TYPES[slug] == null);
  if (unknown.length > 0) {
    throw new Error(
      `Bien'ici search url names a property type Fredy does not know (${unknown.join(', ')}). Please open an ` +
        `issue with this url so it can be added: ${searchUrl}`,
    );
  }
  return [...new Set(slugs.map((slug) => PROPERTY_TYPES[slug]))];
}

/**
 * Read the places a search is limited to.
 *
 * `france` is the site's word for "nowhere in particular" and is dropped, exactly as the site's
 * `LocationsParser` drops it. What the lookup is asked for follows the site too: a slug ending in
 * `-associee` is a delegated commune and is looked up as one, everything else among the kinds a
 * search box suggests.
 *
 * @param {string} raw the decoded place segment
 * @param {string} searchUrl the url, for the error message
 * @returns {BieniciPlaceQuery[]}
 * @throws {Error} for a drawn, circled or travel-time area, which the url cannot spell out
 */
function parsePlaces(raw, searchUrl) {
  return raw
    .split(',')
    .map((slug) => slug.trim())
    .filter((slug) => slug !== '' && !/^france$/i.test(slug) && !MAP_SECTION.test(slug))
    .map((slug) => {
      if (UNSUPPORTED_AREA.test(slug)) {
        throw new Error(
          `Bien'ici search url is limited to an area drawn on the map or reached in a travel time ('${slug}'). ` +
            `Bien'ici keeps that area on its own servers, so Fredy cannot search it. Search the town instead and ` +
            `narrow the job down with Fredy's own map area filter. Url: ${searchUrl}`,
        );
      }
      const delegated = DELEGATED_CITY_SUFFIX.test(slug);
      return {
        slug,
        q: delegated ? slug.replace(DELEGATED_CITY_SUFFIX, '') : slug,
        type: delegated ? 'delegated-city' : 'city,delegated-city,department,postalCode,region',
      };
    });
}

/**
 * Read the query string into filters.
 *
 * @param {URLSearchParams} params
 * @param {string} searchUrl the url, for the error messages
 * @returns {{filters: Record<string, any>, extensionType: string|null}}
 * @throws {Error} for a parameter this does not know, or a figure that is not one
 */
function parseQuery(params, searchUrl) {
  /** @type {Record<string, any>} */
  const filters = {};
  let extensionType = null;
  const unknown = [];

  for (const [name, rawValue] of params) {
    const value = rawValue.trim();
    if (IGNORED_PARAMS.has(name) || isCampaignParam(name) || value === '') continue;

    if (NUMBER_PARAMS[name] != null) {
      const figure = Number(value);
      if (!Number.isFinite(figure)) {
        throw new Error(
          `Bien'ici search parameter '${name}' is '${rawValue}', which is not a number. Searching without it ` +
            `would ignore a limit you set, so the job stops instead. Url: ${searchUrl}`,
        );
      }
      filters[NUMBER_PARAMS[name]] = figure;
    } else if (BOOLEAN_PARAMS[name] != null) {
      const [filter, yes] = BOOLEAN_PARAMS[name];
      filters[filter] = parseYesNo(value, yes);
    } else if (TEXT_PARAMS[name] != null) {
      filters[TEXT_PARAMS[name]] = value;
    } else if (LIST_PARAMS[name] != null) {
      filters[LIST_PARAMS[name]] = value.split(',').filter(Boolean);
    } else if (JSON_PARAMS[name] != null) {
      try {
        filters[JSON_PARAMS[name]] = JSON.parse(value);
      } catch {
        throw new Error(`Bien'ici search parameter '${name}' carries no readable value. Url: ${searchUrl}`);
      }
    } else if (name === EXCLUDE_AGENCY_NEW) {
      filters.excludeAgencyNew = value === 'D';
    } else if (name === 'recherche-etendue') {
      if (value !== NO_EXTENSION && EXTENSION_TYPES[value] == null) unknown.push(name);
      extensionType = EXTENSION_TYPES[value] ?? null;
    } else if (name === 'biens-vendus') {
      throw new Error(
        `Bien'ici search url looks for properties already sold, which are transactions rather than adverts - ` +
          `there is nothing to notify about. Url: ${searchUrl}`,
      );
    } else {
      unknown.push(name);
    }
  }

  if (unknown.length > 0) {
    throw new Error(
      `Bien'ici search url carries ${unknown.map((name) => `'${name}'`).join(', ')}, which Fredy cannot translate ` +
        `yet. Searching without it would cover more than the search you saved, so the job stops instead. Please ` +
        `open an issue with this url so it can be added: ${searchUrl}`,
    );
  }

  // The endpoint takes the availability as a list, which is how the site's own default spells it.
  if (filters.onTheMarket == null) {
    filters.onTheMarket = [true];
  } else if (!Array.isArray(filters.onTheMarket)) {
    filters.onTheMarket = [filters.onTheMarket];
  }

  return { filters, extensionType };
}

/**
 * Read a Bien'ici search url.
 *
 * @param {string} searchUrl a result page url, `https://www.bienici.com/recherche/...`
 * @returns {BieniciSearch}
 * @throws {Error} when the url is not a Bien'ici search, or carries something this cannot translate
 */
export function parseSearchUrl(searchUrl) {
  let url;
  try {
    url = new URL(searchUrl);
  } catch {
    throw new Error(`'${searchUrl}' is not a url Fredy can read.`);
  }

  if (!SEARCH_PATH.test(url.pathname)) {
    throw new Error(
      `'${searchUrl}' is not a Bien'ici search. Run a search on bienici.com and copy the address of its result ` +
        `page, which starts with ${BIENICI_ORIGIN}/recherche/.`,
    );
  }

  const [, dealSegment = '', placeSegment = '', ...rest] = url.pathname.replace(SEARCH_PATH, '').split('/');
  const decode = (segment) => decodeURIComponent(segment);

  const deals = decode(dealSegment)
    .split(',')
    .filter(Boolean)
    .map((deal) => {
      if (FILTER_TYPES[deal] == null) {
        throw new Error(`Bien'ici search url names a deal type Fredy does not know ('${deal}'). Url: ${searchUrl}`);
      }
      return FILTER_TYPES[deal];
    });

  const { filters, extensionType } = parseQuery(url.searchParams, searchUrl);
  const { propertyType, minRooms, maxRooms } = parseTrailingSegments(rest.map(decode), searchUrl);

  // A map section without its boundary would be all of France.
  if (
    decode(placeSegment)
      .split(',')
      .some((slug) => MAP_SECTION.test(slug.trim())) &&
    filters.limit == null
  ) {
    throw new Error(
      `Bien'ici search url searches a part of the map but carries no boundary ('limite') for it, so there is ` +
        `nothing to search in. Url: ${searchUrl}`,
    );
  }

  return {
    filters: {
      // One deal type is sent as the bare string the page sends, several as the list the endpoint
      // takes for them. A url without one is the site's default, a purchase.
      filterType: deals.length === 0 ? 'buy' : deals.length === 1 ? deals[0] : [...new Set(deals)],
      propertyType,
      ...(minRooms != null ? { minRooms } : {}),
      ...(maxRooms != null ? { maxRooms } : {}),
      ...filters,
    },
    places: parsePlaces(decode(placeSegment), searchUrl),
    extensionType,
  };
}

/**
 * Whether the place the lookup answered with is the one the slug names.
 *
 * The lookup is a search, not a dictionary: it always answers with something, and a slug it cannot
 * find comes back as whatever sounds closest - `nowhere-99999` is a hamlet in Normandy. The site
 * never notices because it only ever reads slugs it wrote itself; a url that was edited by hand, or
 * a place Bien'ici has since renamed, would be searched in the wrong town without a word.
 *
 * A slug is the place's name, optionally followed by a postcode or a department number:
 * `paris-75000`, `paris-11e-75011`, `hauts-de-seine-92`, `ile-de-france`. A bare postcode is a
 * postcode search and is checked against the postcodes the place carries.
 *
 * @param {string} slug the place as the url names it
 * @param {{name?: string, postalCodes?: string[]}} place what the lookup answered with
 * @returns {boolean}
 */
export function placeMatchesSlug(slug, place) {
  const postalCodes = Array.isArray(place?.postalCodes) ? place.postalCodes.map(String) : [];
  const q = slug.replace(DELEGATED_CITY_SUFFIX, '');

  if (/^\d{5}$/.test(q)) return postalCodes.includes(q);

  const name = slugify(place?.name);
  if (name === '' || !q.startsWith(name)) return false;

  const rest = q.slice(name.length);
  if (rest === '') return true;

  const code = /^-(\d{5}|\d{1,3}|2[ab])$/.exec(rest)?.[1];
  if (code == null) return false;
  return code.length !== 5 || postalCodes.length === 0 || postalCodes.includes(code);
}

/**
 * Put the resolved zones into the filters, and add what every request carries.
 *
 * @param {Record<string, any>} filters the filters {@link parseSearchUrl} read
 * @param {string[]} zoneIds the zones the places resolved to; empty for all of France
 * @param {{size?: number}} [options]
 * @returns {Record<string, any>} the request's `filters`
 */
export function buildFilters(filters, zoneIds, { size = DEFAULT_PAGE_SIZE } = {}) {
  return {
    size,
    from: 0,
    showAllModels: false,
    ...filters,
    page: 1,
    // Newest first, whatever the url's own `tri` says: the job only ever wants what is new.
    sortBy: 'publicationDate',
    sortOrder: 'desc',
    ...(zoneIds.length > 0 ? { zoneIdsByTypes: { zoneIds } } : {}),
  };
}
