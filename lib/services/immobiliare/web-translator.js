/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Reads a search url copied out of immobiliare.it into the criteria its own endpoint searches by.
 *
 * ```
 * https://www.immobiliare.it/vendita-case/erbusco/?prezzoMassimo=300000
 * -> [['idContratto', '1'], ['idCategoria', '1'], ['prezzoMassimo', '300000'],
 *     ['idNazione', 'IT'], ['fkRegione', 'lom'], ['idProvincia', 'BS'], ['idComune', '7369']]
 * ```
 *
 * The criteria are a list rather than an object because the website says several things under one
 * name - `idTipologia[]=12&idTipologia[]=13` is a search for two kinds of house at once - and an
 * object would keep the last of them and quietly narrow the search.
 *
 * A url says three things and this reads all three: the first path segment says what is on offer
 * and on what terms, the segments after it name the place, and the query string carries the
 * filters. Only the place needs looking up - see `./geography.js` - because it is the one thing the
 * url spells in words that the endpoint wants as a number.
 *
 * The filters travel untouched, which is what makes a url with a filter this has never seen still
 * translate: the endpoint reads the very parameters the website put in the url. The two exceptions
 * are the page and the sort, which the caller sets per request.
 *
 * See `reverse-engineered-immobiliare.md`.
 */

import { readCategory } from './web-paths.js';
import { resolvePlace } from './geography.js';

/** The map search, whose url already carries its criteria and needs no reading. */
export const MAP_SEARCH_PATH = '/search-list/';

/** The prefix the website puts in front of a search shown in another language. */
const LANGUAGE_SEGMENT = /^[a-z]{2}$/;

/**
 * Set per request rather than per search, so whatever the url says about it is dropped. The sort is
 * not one of these: the pipeline appends it to the url precisely so that the search carries it.
 */
const PER_REQUEST = ['pag'];

/**
 * @param {string} webUrl A url copied out of immobiliare.it.
 * @returns {Promise<Array<[string, string]>|null>} the criteria to search by, or null when the url
 *   names a search that cannot be read without rendering it
 */
export async function translateSearchUrl(webUrl) {
  let parsed;
  try {
    parsed = new URL(webUrl);
  } catch {
    return null;
  }

  const segments = parsed.pathname.split('/').filter((segment) => segment !== '');
  if (segments.length > 0 && LANGUAGE_SEGMENT.test(segments[0])) segments.shift();

  const category = readCategory(segments.shift() ?? '');
  if (category == null || segments.length === 0) return null;

  const place = await resolvePlace(segments);
  if (place == null) return null;

  // The place wins over anything the url happened to carry under the same name, and a filter wins
  // over the category's defaults, exactly as the website reads its own url.
  const dropped = new Set([...PER_REQUEST, ...Object.keys(place)]);
  const filters = [...parsed.searchParams].filter(([name]) => !dropped.has(name));
  const defaults = Object.entries(category).filter(([name]) => !filters.some(([other]) => other === name));

  return [...defaults, ...filters, ...Object.entries(place)];
}
