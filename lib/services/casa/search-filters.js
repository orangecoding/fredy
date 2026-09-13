/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * What a search url's parameters mean to the search api.
 *
 * The table is not guesswork: casa.it ships the converter that writes these urls in
 * `/portal-srp/common-*.js`, and this is that mapping read backwards. Every entry below was then
 * confirmed against the api itself, by watching what a filter does to the total of a known search -
 * Roma has enough of everything that a flag which does nothing shows immediately. Where the
 * converter and the api disagreed, the api won, because the api is what gets asked in the end.
 *
 * A parameter missing from here is not passed through and not ignored - the whole url is left
 * untranslated and read off the website instead, and for a measured reason: this api drops a filter
 * name it does not know without a word, so a name we get wrong widens the search in silence. An
 * endpoint that refuses what it dislikes and names the field can be handed parameters it was never
 * taught. This one cannot.
 *
 * See `reverse-engineered-casa.md`.
 */

/** Parameters that bound a figure: the url names each end, the api takes one object with both. */
const RANGES = {
  priceMin: ['price', 'gte'],
  priceMax: ['price', 'lte'],
  mqMin: ['surface', 'gte'],
  mqMax: ['surface', 'lte'],
  numRoomsMin: ['rooms', 'gte'],
  numRoomsMax: ['rooms', 'lte'],
  numBaths: ['bathrooms', 'gte'],
  mqpriceMin: ['mqprice', 'gte'],
  mqpriceMax: ['mqprice', 'lte'],
  paymentMin: ['payment', 'gte'],
  paymentMax: ['payment', 'lte'],
  buildingYearMin: ['building_year', 'gte'],
  buildingYearMax: ['building_year', 'lte'],
  numParkingSpaces: ['carparks', 'gte'],
};

/** Parameters the url writes as a comma-joined list and the api takes as an array. */
const LISTS = {
  propertyTypes: 'property.types',
  buildingCondition: 'building_condition',
  garden: 'garden.type',
  heatingType: 'heating.types',
  furniture: 'furniture',
  license_type_groups: 'license_type_groups',
  zones: 'zone',
};

/**
 * Parameters that carry one value. Several of these answer a list with a bare "Internal Server
 * Error" rather than with a message, so the shape matters as much as the name.
 */
const SCALARS = {
  tr: 'transaction.type',
  propertyTypeGroup: 'property_type_group',
  rentType: 'rent_type',
  energyClass: 'energy_class',
  publication_date: 'publication_date',
  publicationDt: 'publication_date',
  sellerType: 'publisher',
  photo: 'only_with_photos',
  pId: 'publisher.id',
  level: 'level',
  availability: 'availability',
  commercial_building_location: 'commercial_building_location',
};

/**
 * Toggles the url writes as `true` and the api takes as a boolean of the same name. Each name was
 * confirmed by watching it move the total of a known search; `is_auction` is the one toggle whose
 * api name differs, and is handled below rather than here.
 */
const FLAGS = {
  exclude_auction: 'exclude_auction',
  only_auction: 'only_auction',
  exclude_private_negotiation: 'exclude_private_negotiation',
  only_private_negotiation: 'only_private_negotiation',
  exclude_under_construction: 'exclude_under_construction',
  has_swimming_pool: 'has_swimming_pool',
  has_reception: 'has_reception',
  has_virtual_tour: 'has_virtual_tour',
  air_conditioned: 'air_conditioned',
  is_lux: 'is_lux',
  includes_property_ownership: 'includes_property_ownership',
  terrace: 'terrace',
  lift: 'lift',
};

/** What the url's `balconyAndTerrace` list is allowed to name, and the boolean each one sets. */
const BALCONY_AND_TERRACE = { balcone: 'balcony', terrazzo: 'terrace' };

/** What the url's `category` names, read the way the path's own segment is read. */
const CATEGORIES = { residenziale: 'case', commerciale: 'commerciale', stanze: 'stanze' };

/**
 * Parameters the url carries that no search needs: analytics trackers and the site's own
 * bookkeeping. Dropping one of these changes nothing about which adverts a search answers with,
 * which is what separates them from an unknown *filter* - a filter that went missing would widen
 * the search in silence, a tracker that goes missing widens nothing. Held lowercase; names are
 * compared lowercased.
 */
const IGNORED = new Set([
  't',
  'precision',
  'propose',
  'source',
  'isroomsnumber',
  'gclid',
  'gbraid',
  'gad',
  'fbclid',
  'wbraid',
]);

/** Name prefixes of the trackers campaigns append, all of them noise as far as a search goes. */
const IGNORED_PREFIXES = ['utm_', 'at_', 'amp;', 'amp%3B'];

/**
 * Set per request rather than per search, so the url's own value for them is dropped. The sort is
 * one of these: the pipeline appends it to the url in the website's spelling, and the api has a
 * spelling of its own that the caller sets.
 */
const PER_REQUEST = ['page', 'sortType'];

/** Named where the search happens rather than what is searched for, so they answer as the area. */
const AREA_PARAMS = ['geopolygon', 'geocircle', 'geobounds', 'nearby', 'q'];

/** The query parameter naming the place a map search was drawn within. */
export const WHERE_HINT_PARAM = 'q';

/**
 * Whether a value is a figure the api wants as a number rather than as text.
 *
 * @param {string} raw
 * @returns {boolean}
 */
function isNumber(raw) {
  return /^-?\d+(\.\d+)?$/.test(raw);
}

/**
 * Write one value the way casa.it writes it.
 *
 * The website has an encoder of its own - accents stripped, an apostrophe turned into a space, a
 * comma into `%2C`, a space into `+` - and the api is fed the result of it verbatim. So a value has
 * to reach the api in that spelling however the url happened to carry it: a job's url passes
 * through a rewriter on the way here, which turns the `+` back into `%20`, and `casa%20indipendente`
 * matches nothing while `casa+indipendente` matches the houses. Neither is reported as an error.
 *
 * @param {string} raw One value, exactly as the url carries it.
 * @returns {string} the same value in the spelling the api answers to
 */
export function toApiValue(raw) {
  // `+` means a space in a query string, which `decodeURIComponent` does not know.
  const decoded = decodeURIComponent(String(raw).replace(/\+/g, '%20'));
  return decoded
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/'/g, ' ')
    .replace(/,/g, '%2C')
    .replace(/ /g, '+');
}

/**
 * The one value the api wants *decoded*: a floor level. Sent as `piano+terra` the level filter is
 * refused with a bare 500; sent as `piano terra` it answers. Every other multi-word value in this
 * table is the other way round, which is exactly the kind of inconsistency that has to be measured
 * rather than assumed.
 *
 * @param {string} raw The value exactly as the url carries it.
 * @returns {string} the value with real spaces, the form the api keeps levels under
 */
function toLevelValue(raw) {
  return toApiValue(raw).replace(/\+/g, ' ');
}

/**
 * Split one list-valued parameter.
 *
 * The website joins the items with a comma and escapes it, so the separator in the url is `%2C`
 * while a `+` inside an item is left as it is. Splitting on a literal comma finds nothing to split
 * and hands the api one long value, which it accepts and matches nothing with.
 *
 * @param {string} raw The value exactly as the url carries it.
 * @returns {string[]}
 */
function splitList(raw) {
  return raw
    .split(/%2C|,/i)
    .map((item) => toApiValue(item.trim()))
    .filter(Boolean);
}

/**
 * Whether a parameter is one of the trackers the IGNORED names or prefixes cover.
 *
 * @param {string} name A parameter name, decoded.
 * @returns {boolean}
 */
function isIgnored(name) {
  const lower = name.toLowerCase();
  return IGNORED.has(lower) || IGNORED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Translate the query string of a search url.
 *
 * Values are taken exactly as the url carries them, undecoded. The website encodes a value with an
 * encoder of its own - accents stripped, an apostrophe turned into a space, a space into `+` and a
 * comma into `%2C` - and the api is fed the result of that verbatim. A value decoded on the way
 * through therefore stops matching: `casa+indipendente` finds the houses, `casa indipendente`
 * finds none of them, and neither is reported as an error.
 *
 * @param {string} query The url's query string, with or without its leading `?`.
 * @returns {{filters: Record<string, any>, area: Record<string, string>, modifiers: Record<string, any>}|null}
 *   the api filters, the untranslated area parameters, the request modifiers, or null when the url
 *   names a filter this cannot carry over
 */
export function readFilters(query) {
  /** @type {Record<string, any>} */
  const filters = {};
  /** @type {Record<string, string>} */
  const area = {};
  /** @type {Record<string, any>} */
  const modifiers = {};

  for (const pair of String(query).replace(/^\?/, '').split('&')) {
    if (pair === '') continue;
    const separator = pair.indexOf('=');
    const name = decodeURIComponent(separator < 0 ? pair : pair.slice(0, separator));
    const raw = separator < 0 ? '' : pair.slice(separator + 1);

    if (PER_REQUEST.includes(name)) continue;
    if (isIgnored(name)) continue;
    if (AREA_PARAMS.includes(name)) {
      area[name] = decodeURIComponent(raw);
      continue;
    }

    if (RANGES[name] != null) {
      const [key, bound] = RANGES[name];
      filters[key] = { ...(filters[key] ?? {}), [bound]: isNumber(raw) ? Number(raw) : toApiValue(raw) };
    } else if (name === 'numRooms') {
      // The exact-room count the site's dropdown writes, as against the numRoomsMin/Max range:
      // both ends of the api's range get the same figure.
      const rooms = isNumber(raw) ? Number(raw) : null;
      if (rooms == null) return null;
      filters.rooms = { gte: rooms, lte: rooms };
    } else if (name === 'is_auction') {
      // The site's three-state auction toggle, which the api carries as two different filters:
      // only auctions, or everything but them.
      if (raw === 'true') filters.only_auction = true;
      else if (raw === 'false') filters.exclude_auction = true;
      else return null;
    } else if (name === 'balconyAndTerrace') {
      // One list in the url, two booleans in the api. A value outside the pair the site writes is
      // a filter we would be dropping - refused, the way any unknown filter is.
      for (const item of splitList(raw)) {
        const flag = BALCONY_AND_TERRACE[item.replace(/\+/g, ' ')];
        if (flag == null) return null;
        filters[flag] = true;
      }
    } else if (name === 'category') {
      // The group, spelled the way a landing page spells it. A group the api does not know is
      // answered with the residential one rather than with an error, so an unconfirmed value is
      // refused here rather than widened there.
      const group = CATEGORIES[toApiValue(raw).replace(/\+/g, ' ')];
      if (group == null) return null;
      if (filters.property_type_group == null) filters.property_type_group = group;
    } else if (name === 'surrounding') {
      // The comuni-limitrofi toggle is not a filter: it is a modifier of the request, which asks
      // the api to reach past the place's own border.
      if (raw === 'true') modifiers.with_surroundings = true;
      else if (raw !== 'false') return null;
    } else if (LISTS[name] != null) {
      filters[LISTS[name]] = [...(filters[LISTS[name]] ?? []), ...splitList(raw)];
    } else if (FLAGS[name] != null) {
      if (raw !== 'true' && raw !== 'false') return null;
      filters[FLAGS[name]] = raw === 'true';
    } else if (SCALARS[name] != null) {
      filters[SCALARS[name]] = name === 'level' ? toLevelValue(raw) : toApiValue(raw);
    } else {
      return null;
    }
  }

  return { filters, area, modifiers };
}
