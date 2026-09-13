/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * What a search url's words mean to the api.
 *
 * The website hides the whole search in its path - the category in the first segment, every filter
 * in a `con-...` segment near the end - so this table is what lets a pasted url be asked of the api
 * instead of being rendered. It is the fallback these days: the first translator is idealista's own
 * (see `./deeplink.js`), and a url it cannot be asked for is the only one this table sees. Each
 * entry was read off a search page and confirmed against the api, which answers with the number of
 * filters it accepted and so says plainly when a name is wrong.
 *
 * A word that is missing here is not translated to something close: the caller reads the website
 * for that search instead. A filter quietly dropped would widen the search behind the user's back,
 * and they would be told about adverts they asked not to see.
 *
 * Only Italy's vocabulary is spelled out in full. Spain and Portugal get their category, their
 * operation and their price and size bounds - the words a url cannot avoid, each of them confirmed
 * against idealista's own url parser, which answers what it read a url as - and nothing else, on
 * purpose: their tick-box slugs were never read off a live page here, and a filter mapped by
 * guesswork would widen a search silently, which is the one failure this whole table exists to
 * prevent. A `con-`/`com-` segment naming anything else is refused, and the caller reads the
 * website for that search - the same answer it has always given an Italian url it could not carry
 * over. The portal's own parser (`./deeplink.js`) reads every filter of all three countries
 * anyway, and this table is only what stands behind it.
 *
 * Deliberately absent, because the api offers nothing that means the same thing:
 * - `terrazza-e-balcone` - the box means their union, and the api takes `terrance` and `balcony`
 *   as two searches' worth of conditions
 * - `ville`, `rustici`, `mansarde`, `loft-open-space` - the api has a shape for each of these and
 *   which one is guesswork, where the four house shapes below were confirmed against a live search
 * - the "only auctions" tick, whose url name was never seen on a page, where `aste_no` comes off a
 *   live search url
 * - the letting terms
 *
 * `reverse-engineered-idealista.md` records the two names that read backwards - `con-prezzo_N` is a
 * maximum where `con-dimensione_N` is a minimum - and how each mapping was confirmed. The energy
 * boxes' api name is not the app's own: the android app sends no energy filter at all, and the
 * parameter is read only by the search endpoint. The terrace one is spelled the way the app spells
 * it - `terrance` - where `terrace` is ignored in silence. And the "Appartamenti" box is `flat=1`
 * on its own: every penthouse and two-level flat it covers already answers a `flat=1` search,
 * measured by walking both and diffing the property codes, so the box is one search, not three.
 */

/** @import { Portal } from './portal.js' */

/** What a filter segment starts with: `con-` on two of the sites, `com-` on the Portuguese one. */
const FILTER_PREFIX = /^co[nm]-/;

/**
 * Website category to the api's `propertyType`, per country. Land is absent from all three: the api
 * sells none.
 *
 * @type {Object.<string, Object.<string, string>>}
 */
const CATEGORIES = {
  it: {
    case: 'homes',
    stanze: 'bedrooms',
    uffici: 'offices',
    negozi: 'premises',
    garage: 'garages',
    edifici: 'buildings',
    cantine: 'storageRooms',
  },
  es: {
    viviendas: 'homes',
    habitacion: 'bedrooms',
    oficinas: 'offices',
    locales: 'premises',
    garajes: 'garages',
    edificios: 'buildings',
    trasteros: 'storageRooms',
  },
  // `quartos` and `lojas` are missing on purpose: idealista's own parser answers a 500 for both,
  // whichever operation and place the url names, so what the portal calls those two could not be
  // confirmed and a guess is not worth a widened search. A url naming one is read off the website.
  pt: {
    casas: 'homes',
    escritorios: 'offices',
    garagens: 'garages',
    predios: 'buildings',
    arrecadacoes: 'storageRooms',
  },
};

/**
 * Website operation to the api's `operation`, per country.
 *
 * @type {Object.<string, Object.<string, string>>}
 */
const OPERATIONS = {
  it: { vendita: 'sale', affitto: 'rent' },
  es: { venta: 'sale', alquiler: 'rent' },
  pt: { comprar: 'sale', arrendar: 'rent' },
};

/**
 * Filters carrying a number, which the website writes as `<name>_<number>`, per country.
 *
 * @type {Object.<string, Array<{pattern: RegExp, name: string}>>}
 */
const NUMBERED = {
  it: [
    { pattern: /^prezzo_(\d+)$/, name: 'maxPrice' },
    { pattern: /^prezzo-min_(\d+)$/, name: 'minPrice' },
    { pattern: /^dimensione_(\d+)$/, name: 'minSize' },
    { pattern: /^dimensione-max_(\d+)$/, name: 'maxSize' },
  ],
  es: [
    { pattern: /^precio-hasta_(\d+)$/, name: 'maxPrice' },
    { pattern: /^precio-desde_(\d+)$/, name: 'minPrice' },
    { pattern: /^metros-cuadrados-mas-de_(\d+)$/, name: 'minSize' },
    { pattern: /^metros-cuadrados-menos-de_(\d+)$/, name: 'maxSize' },
  ],
  pt: [
    { pattern: /^preco-max_(\d+)$/, name: 'maxPrice' },
    { pattern: /^preco-min_(\d+)$/, name: 'minPrice' },
    { pattern: /^tamanho-min_(\d+)$/, name: 'minSize' },
    { pattern: /^tamanho-max_(\d+)$/, name: 'maxSize' },
  ],
};

/**
 * Filters the website ticks one box at a time and the api takes as one list. The top box of the
 * counted ones counts upwards - "5 o piu locali", "3 o piu bagni" - and the api reads its own top
 * value the same way.
 */
const COUNTED_IT = {
  'monolocali-1': ['bedrooms', '1'],
  'bilocali-2': ['bedrooms', '2'],
  'trilocali-3': ['bedrooms', '3'],
  'quadrilocali-4': ['bedrooms', '4'],
  '5-locali-o-piu': ['bedrooms', '5'],
  'bagno-1': ['bathrooms', '1'],
  'bagno-2': ['bathrooms', '2'],
  'bagno-3': ['bathrooms', '3'],
  'case-indipendenti': ['subTypology', 'independantHouse'],
  'ville-indipendenti': ['subTypology', 'villa'],
  'villette-a-schiera': ['subTypology', 'terracedHouse'],
  'villette-bifamiliari': ['subTypology', 'semidetachedHouse'],
  'alta-efficienza': ['energyEfficiency', 'high'],
  'media-efficienza': ['energyEfficiency', 'medium'],
  'bassa-efficienza': ['energyEfficiency', 'low'],
};

/**
 * The condition of the building. The website ticks these one at a time and means their union; the
 * api takes one value and refuses a list, so a url naming several is run once per value and the
 * answers are merged. The name is what the caller looks for to know a search has to be split.
 */
const CONDITION_PARAM = 'preservation';

/** Filters that are either set or not. */
const SWITCHES_IT = {
  aste_no: ['auction', 'excludeAuctions'],
  ascensori: ['elevator', '1'],
  balcone: ['balcony', '1'],
  terrazza: ['terrance', '1'],
  giardino: ['garden', '1'],
  'giardino-privato': ['privateGarden', '1'],
  piscina: ['swimmingPool', '1'],
  animali: ['petsAllowed', '1'],
  ariacondizionata: ['airConditioning', '1'],
  'armadi-muro': ['builtinWardrobes', '1'],
  ripostiglio: ['storeRoom', '1'],
  lusso: ['luxury', '1'],
  'vista-mare': ['seaViews', '1'],
  garage: ['garage', '1'],
  appartamenti: ['flat', '1'],
  'solo-appartamenti': ['flat', '1'],
  attici: ['penthouse', '1'],
  'appartamenti-due-livelli': ['duplex', '1'],
  'casali-o-cascine': ['countryHouse', '1'],
  'nuova-costruzione': [CONDITION_PARAM, 'newdevelopment'],
  'buono-stato': [CONDITION_PARAM, 'good'],
  ristrutturare: [CONDITION_PARAM, 'renew'],
  'piano-terra': ['floorHeights', 'groundFloor'],
  'piani-intermedi': ['floorHeights', 'intermediateFloor'],
  'ultimo-piano': ['floorHeights', 'topFloor'],
  arredamento_ammobiliato: ['furnished', 'furnished'],
  'arredamento_solo-cucina-arredata': ['furnished', 'furnishedKitchen'],
};

/** What a country whose tick boxes were never read off a page has to offer. */
const EMPTY_TICKS = /** @type {Object.<string, [string, string]>} */ ({});

/**
 * The counted and switched filters of one country, which only Italy has.
 *
 * @param {Portal} portal
 * @returns {{counted: Object.<string, [string, string]>, switches: Object.<string, [string, string]>}}
 */
function ticksOf(portal) {
  return portal.country === 'it'
    ? { counted: COUNTED_IT, switches: SWITCHES_IT }
    : { counted: EMPTY_TICKS, switches: EMPTY_TICKS };
}

/**
 * Read the category segment of a search url.
 *
 * @param {Portal} portal The site the url was copied from, whose language the segment is in.
 * @param {string} segment For example `vendita-case`, `alquiler-viviendas`, `arrendar-casas`.
 * @returns {{operation: string, propertyType: string}|null} null when the category is one the api
 *   does not serve
 */
export function readCategory(portal, segment) {
  const separator = segment.indexOf('-');
  if (separator < 0) return null;

  const operation = OPERATIONS[portal.country]?.[segment.slice(0, separator)];
  const propertyType = CATEGORIES[portal.country]?.[segment.slice(separator + 1)];
  return operation == null || propertyType == null ? null : { operation, propertyType };
}

/**
 * @param {Portal} portal
 * @param {string} token One filter, as the url spells it.
 * @returns {[string, string]|null} the api parameter it sets, or null when it has none
 */
function readFilter(portal, token) {
  const { counted, switches } = ticksOf(portal);
  if (switches[token] != null) return /** @type {[string, string]} */ (switches[token]);
  if (counted[token] != null) return /** @type {[string, string]} */ (counted[token]);

  for (const { pattern, name } of NUMBERED[portal.country] ?? []) {
    const match = token.match(pattern);
    if (match != null) return [name, match[1]];
  }
  return null;
}

/**
 * Translate the filter segment of a search url.
 *
 * @param {Portal} portal The site the url was copied from.
 * @param {string} segment The segment, `con-`/`com-` and all, or an empty string when the url has
 *   none.
 * @returns {Array<Array<[string, string]>>|null} one parameter set per search that has to be run -
 *   more than one only when the url names several building conditions, which the api takes one at a
 *   time - or null when a filter has no counterpart and the search therefore cannot be asked of the
 *   api at all
 */
export function readFilters(portal, segment) {
  if (segment === '') return [[]];

  const { counted } = ticksOf(portal);
  /** @type {Map<string, string[]>} */
  const params = new Map();
  for (const token of segment.replace(FILTER_PREFIX, '').split(',')) {
    const filter = readFilter(portal, token);
    if (filter == null) return null;

    const [name, value] = filter;
    const held = params.get(name);
    if (held == null) params.set(name, [value]);
    // Only the filters the website ticks box by box stack; a second value for anything else means
    // the url said two different things, which is not a search this can carry over faithfully.
    else if (counted[token] != null || name === CONDITION_PARAM) held.push(value);
    else if (!held.includes(value)) return null;
  }

  const conditions = params.get(CONDITION_PARAM) ?? [];
  params.delete(CONDITION_PARAM);

  const common = /** @type {Array<[string, string]>} */ ([...params].map(([name, values]) => [name, values.join(',')]));
  const splits =
    conditions.length === 0
      ? [[]]
      : conditions.map((condition) => /** @type {Array<[string, string]>} */ ([[CONDITION_PARAM, condition]]));

  return splits.map((split) => [...common, ...split]);
}
