/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Turns the place a search url names into the location id the api searches by.
 *
 * The website names a place in words - `/vendita-case/milano-milano/centro-storico/` - while the
 * api names it as an id, `0-EU-IT-MI-01-001-135-01`. The three countries share the shape of both:
 * a Spanish id reads `0-EU-ES-28-07-001-079` and a Portuguese one `0-EU-PT-11-06`, and each
 * country's catalogue is opened at an anchor of its own (`./portal.js`). Nothing in the url carries
 * that id and no
 * endpoint translates one into the other, so the place is found by walking the api's own catalogue
 * of locations, which is a tree: provinces, then the municipalities of one province, then the
 * districts of one municipality, then its neighborhoods.
 *
 * Each level is matched by name, in the url's own spelling of it (`lib/utils/slugify.js`). A
 * location is called `Centro Storico, Milano` and the url calls it
 * `centro-storico`, so both the full name and the part before the last comma are slugified and
 * either may match. A place that matches nothing leaves the caller to read the website instead,
 * which is why every failure here is a `null` rather than an error.
 *
 * See `reverse-engineered-idealista.md` for the shape of an id and for the zone level, which is a
 * real location that this catalogue does not list.
 */

import { call, locationsPath } from './mobile-api.js';
import { createPromiseCache } from '../../utils/promise-cache.js';
import { slugify } from '../../utils/slugify.js';
/** @import { Portal } from './portal.js' */

/** Ordered from the deepest level to the shallowest, which is the order a child is looked for in. */
const LEVELS = ['neighborhoods', 'districts', 'municipalities', 'provinces'];

/**
 * One catalogue level per key, shared by every job and keyed by the country it was read from. The
 * tree is a property of the portal rather than of a run, and it is large enough that reading it
 * once a process is worth it.
 *
 * @type {ReturnType<typeof createPromiseCache<any>>}
 */
const catalogue = createPromiseCache();

/**
 * The two spellings a location answers to: its whole name, and the part before the last comma,
 * since the api qualifies every name with the place above it and the url does not.
 *
 * @param {string} locationName
 * @returns {string[]}
 */
function spellings(locationName) {
  const head = String(locationName).split(',')[0];
  return [slugify(locationName), slugify(head)];
}

/**
 * Read one level of the catalogue.
 *
 * @param {Portal} portal The country whose catalogue is read.
 * @param {string} parentId The location to open.
 * @param {{operation: string, propertyType: string}} criteria
 * @returns {Promise<any>} the api's answer, holding the ancestors and the children of that location
 */
function readLevel(portal, parentId, { operation, propertyType }) {
  const key = `${portal.country}|${operation}|${propertyType}|${parentId}`;
  const body = /** @type {Array<[string, unknown]>} */ ([
    ['operation', operation],
    ['propertyType', propertyType],
    ['locale', portal.country],
    ['locationIds', parentId],
  ]);
  return catalogue.get(key, () => call(portal, locationsPath(portal), { body }));
}

/**
 * Every location one level below the given one, deepest level first.
 *
 * @param {any} level The api's answer.
 * @param {string} parentId
 * @returns {any[]}
 */
function childrenOf(level, parentId) {
  return LEVELS.flatMap((name) => level?.[name] ?? []).filter(
    (location) => typeof location?.locationId === 'string' && location.locationId.startsWith(`${parentId}-`),
  );
}

/**
 * @param {any[]} locations
 * @param {string} slug
 * @returns {any|null}
 */
function matching(locations, slug) {
  return locations.find((location) => spellings(location?.locationName ?? '').includes(slug)) ?? null;
}

/**
 * Find the province a `<municipality>-<province>` slug ends with.
 *
 * @param {any[]} provinces
 * @param {string} slug
 * @returns {any[]} the candidates, the most specific province name first
 */
function provincesEndingIn(provinces, slug) {
  return provinces
    .filter((province) => {
      const named = slugify(province?.locationName ?? '');
      return named !== '' && (slug === named || slug.endsWith(`-${named}`));
    })
    .sort((left, right) => (right?.locationName?.length ?? 0) - (left?.locationName?.length ?? 0));
}

/**
 * Resolve the first path segment, which names either a whole province or a municipality in one.
 *
 * Italy and Spain spell a municipality as `<municipality>-<province>` and a whole province with the
 * suffix the portal carries (`milano-provincia`, `madrid-provincia`). Portugal names a district
 * without repeating it - `/comprar-casas/lisboa/` - so a segment that is a province's own name is
 * read as the municipality of that name inside it, and as the province itself when the province has
 * no municipality by that name.
 *
 * @param {Portal} portal
 * @param {string} slug
 * @param {{operation: string, propertyType: string}} criteria
 * @returns {Promise<string|null>}
 */
async function resolveTopLevel(portal, slug, criteria) {
  const provinces = (await readLevel(portal, portal.provinceAnchor, criteria))?.provinces ?? [];

  const suffix = portal.provinceSuffixes.find((candidate) => slug.endsWith(candidate));
  if (suffix != null) {
    const named = slug.slice(0, -suffix.length);
    return provinces.find((province) => slugify(province?.locationName ?? '') === named)?.locationId ?? null;
  }

  for (const province of provincesEndingIn(provinces, slug)) {
    const level = await readLevel(portal, province.locationId, criteria);
    const municipality = matching(level?.municipalities ?? [], slug);
    if (municipality != null) return municipality.locationId;
    if (slugify(province?.locationName ?? '') === slug) return province.locationId;
  }
  return null;
}

/**
 * Resolve the place a search url names.
 *
 * @param {Portal} portal The country the url belongs to.
 * @param {string[]} slugs The url's path segments below the category, outermost first.
 * @param {{operation: string, propertyType: string}} criteria What the search is for, since the
 *   catalogue only lists locations that have adverts of that kind.
 * @returns {Promise<string|null>} the location id, or null when the place cannot be found
 */
export async function resolveLocationId(portal, slugs, criteria) {
  if (slugs.length === 0) return null;

  let locationId = await resolveTopLevel(portal, slugs[0], criteria);
  if (locationId == null) return null;

  for (const slug of slugs.slice(1)) {
    const level = await readLevel(portal, locationId, criteria);
    const child = matching(childrenOf(level, locationId), slug);
    if (child == null) return null;
    locationId = child.locationId;
  }

  return locationId;
}
