/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { groupListingsByPosition } from '../../ui/src/views/listings/mapUtils.js';

const listing = (id, latitude, longitude) => ({ id, latitude, longitude });

describe('groupListingsByPosition', () => {
  it('puts listings on the same spot into one group', () => {
    const groups = groupListingsByPosition([
      listing('a', 51.2277, 6.7735),
      listing('b', 51.2277, 6.7735),
      listing('c', 51.2277, 6.7735),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({
      lat: 51.2277,
      lng: 6.7735,
      listings: [listing('a', 51.2277, 6.7735), listing('b', 51.2277, 6.7735), listing('c', 51.2277, 6.7735)],
    });
  });

  it('keeps separate positions apart, in the order they came in', () => {
    const groups = groupListingsByPosition([
      listing('a', 51.2277, 6.7735),
      listing('b', 52.517, 13.3888),
      listing('c', 51.2277, 6.7735),
    ]);

    expect(groups.map((group) => group.listings.map((entry) => entry.id))).toEqual([['a', 'c'], ['b']]);
  });

  it('does not merge listings a few metres apart', () => {
    // ~11 m: two houses on the same street stay two pins.
    const groups = groupListingsByPosition([listing('a', 51.2277, 6.7735), listing('b', 51.2278, 6.7735)]);

    expect(groups).toHaveLength(2);
  });

  it('merges coordinates that differ only in float noise', () => {
    const groups = groupListingsByPosition([listing('a', 51.2277, 6.7735), listing('b', 51.22770000001, 6.7735)]);

    expect(groups).toHaveLength(1);
  });

  it('drops listings that have no place on a map', () => {
    const groups = groupListingsByPosition([
      listing('a', 51.2277, 6.7735),
      listing('missing', null, null),
      listing('ungeocodable', -1, -1),
      listing('halfway', 51.2277, undefined),
    ]);

    expect(groups.map((group) => group.listings.map((entry) => entry.id))).toEqual([['a']]);
  });

  it('copes with nothing to group', () => {
    expect(groupListingsByPosition([])).toEqual([]);
    expect(groupListingsByPosition(undefined)).toEqual([]);
  });
});
