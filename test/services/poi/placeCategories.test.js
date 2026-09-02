/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { PLACE_CATEGORIES, PLACE_CATEGORY_IDS, isPlaceCategory } from '../../../lib/services/poi/categories.js';
import { PLACE_CATEGORIES as UI_PLACE_CATEGORIES } from '../../../ui/src/services/travelTime/placeCategories.js';

/**
 * The two halves of a place type, and the tagging behind the ones that are easy to get wrong.
 *
 * The list exists twice on purpose - the tags live on the server, the icons in the interface, and
 * the frontend may not import server code - so the ids drifting apart is the one failure this
 * arrangement invites. It is also silent: the settings endpoint rejects an id it does not know, so
 * a category offered by the interface alone would look saveable and then never be saved.
 */
describe('place categories', () => {
  it('offers the same categories on both sides, in the same order', () => {
    expect(UI_PLACE_CATEGORIES.map((category) => category.id)).toEqual([...PLACE_CATEGORY_IDS]);
  });

  it('draws every category with something', () => {
    // An id with no icon renders an empty span where the others show a pictogram, which reads as a
    // broken row rather than as a category that happens to have no picture.
    expect(UI_PLACE_CATEGORIES.filter((category) => !category.icon?.trim())).toEqual([]);
  });

  it('gives every category at least one tag to look for', () => {
    const untagged = PLACE_CATEGORY_IDS.filter((id) => (PLACE_CATEGORIES[id].tags ?? []).length === 0);
    expect(untagged).toEqual([]);
  });

  it('accepts the transport categories and still rejects anything else', () => {
    expect(isPlaceCategory('busStop')).toBe(true);
    expect(isPlaceCategory('trainStation')).toBe(true);
    expect(isPlaceCategory('busstop')).toBe(false);
    expect(isPlaceCategory('tramStop')).toBe(false);
  });

  it('looks for bus stops by the stop pole rather than by platform', () => {
    // `public_transport=platform` alone also matches tram and railway platforms, and German bus
    // stops carry `highway=bus_stop` whether or not they also carry the newer scheme.
    expect(PLACE_CATEGORIES.busStop.tags).toEqual([['highway', 'bus_stop']]);
  });

  it('counts an unstaffed halt as a train station', () => {
    // Most S-Bahn and regional stops are `railway=halt`; asking only for `station` would answer
    // "the nearest train station" with the Hauptbahnhof across town.
    expect(PLACE_CATEGORIES.trainStation.tags).toEqual([
      ['railway', 'station'],
      ['railway', 'halt'],
    ]);
  });
});
