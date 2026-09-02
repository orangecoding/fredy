/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The kinds of place a travel time can be measured to, and how OpenStreetMap spells them.
 *
 * A curated list rather than a free text tag. OSM tagging is a folk taxonomy - a gym is
 * `leisure=fitness_centre` in most of Germany, `amenity=gym` in some places and
 * `sport=fitness` in others - and letting people type a tag would move the job of knowing that onto
 * them, with a silent empty result as the only feedback when they get it wrong. A dozen entries
 * that are known to be tagged consistently is a smaller feature that actually answers.
 *
 * This module is the pure half, the same split `countries.js` uses: it holds no state, reads no
 * settings and touches no database, so the Overpass client can import it without dragging SQLite in
 * behind it.
 *
 * The frontend keeps its own list of ids and icons in `ui/src/services/travelTime/placeCategories.js`
 * - the UI may not import server code - but the tags live here alone, because they are the part
 * that decides what is actually found.
 */

/**
 * @typedef {Object} PlaceCategory
 * @property {Array<[string, string]>} tags OSM key/value pairs. Any one of them matching is enough,
 *   which is how a category that is tagged two ways in practice stays one category here.
 */

/**
 * @type {Readonly<Record<string, PlaceCategory>>}
 */
export const PLACE_CATEGORIES = Object.freeze({
  supermarket: { tags: [['shop', 'supermarket']] },
  bakery: { tags: [['shop', 'bakery']] },
  pharmacy: { tags: [['amenity', 'pharmacy']] },
  doctor: { tags: [['amenity', 'doctors']] },
  // Both are in wide use and mean the same thing to somebody asking "is there a nursery nearby".
  kindergarten: { tags: [['amenity', 'kindergarten']] },
  school: { tags: [['amenity', 'school']] },
  gym: {
    tags: [
      ['leisure', 'fitness_centre'],
      ['amenity', 'gym'],
    ],
  },
  park: { tags: [['leisure', 'park']] },
  restaurant: { tags: [['amenity', 'restaurant']] },
  postOffice: { tags: [['amenity', 'post_office']] },
  // The stop pole, deliberately not the newer `public_transport=platform`, which on its own also
  // matches tram and railway platforms and would answer "bus stop" with a railway siding. The newer
  // scheme is mapped *in addition* to `highway=bus_stop` rather than instead of it, so asking for
  // the old tag alone still finds the stops that carry both.
  busStop: { tags: [['highway', 'bus_stop']] },
  // `halt` is the small unstaffed stop, which is what most S-Bahn and regional stops are. Asking
  // only for `station` would find the Hauptbahnhof and miss the platform at the end of the street.
  // Tram stops are `railway=tram_stop` and stay out of this by not being asked for.
  trainStation: {
    tags: [
      ['railway', 'station'],
      ['railway', 'halt'],
    ],
  },
});

/**
 * Every category id, in the order they are offered.
 * @type {string[]}
 */
export const PLACE_CATEGORY_IDS = Object.freeze(Object.keys(PLACE_CATEGORIES));

/**
 * Whether a value names a category Fredy knows how to look for.
 *
 * The settings endpoint rejects anything else rather than storing it: an unknown category would
 * save cleanly, then quietly never produce a travel time, and there would be nothing on screen to
 * explain why.
 *
 * @param {unknown} id
 * @returns {boolean}
 */
export function isPlaceCategory(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(PLACE_CATEGORIES, id);
}
