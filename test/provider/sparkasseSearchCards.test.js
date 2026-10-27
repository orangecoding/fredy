/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { parse } from '../../lib/services/extractor/parser/parser.js';
import { config, createConfig } from '../../lib/provider/sparkasse.js';
import { fixture } from './byUrl/contract.js';

const SEARCH = 'https://immobilien.sparkasse.de/immobilien/treffer?estateTypeGroupingId=396&marketingType=buy';

describe('sparkasse search result cards', () => {
  it('reads every field of every card of the recorded search page', () => {
    const cards = parse(config.crawlContainer, config.crawlFields, fixture('sparkasse.html'), SEARCH);
    expect(cards).toHaveLength(10);

    // The recorded page has cards without a living area; they must not take the room count as the size.
    expect(cards.map((card) => card.size).filter((size) => size != null && !/Wohnfläche/.test(size))).toEqual([]);

    const normalize = createConfig({ url: SEARCH }).normalize;
    for (const card of cards) {
      const listing = normalize(card);
      expect(listing.title).not.toBe('');
      // "Keine Angabe" (price) and a missing living area are real states of a card, not parse failures
      expect(listing.price === null || listing.price > 0).toBe(true);
      expect(listing.size === null || listing.size > 1).toBe(true);
      expect(listing.rooms).toBeGreaterThan(0);
      expect(listing.address).toBeTruthy();
      expect(listing.link).toMatch(/^https:\/\/immobilien\.sparkasse\.de\/expose\//);
      expect(listing.image).toMatch(/^https?:\/\//);
    }
  });
});
