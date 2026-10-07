/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { pickExposeLink } from '../../tools/testFixtures/downloadFixtures.js';

/**
 * Which exposé the fixture download records. SeLoger's newest result is regularly a Belles Demeures
 * advert, whose link the transport refuses to fetch - and taking it lost the detail fixture on a
 * download that had just deleted the old one.
 */
describe('pickExposeLink', () => {
  it("takes the first advert on one of the provider's own sites", () => {
    const links = [
      'https://www.bellesdemeures.com/annonces/vente/appartement/paris-75/1.htm',
      'https://www.seloger.com/annonce/location/ile-de-france/paris-75/paris-75000/2',
      'https://www.seloger.com/annonce/location/ile-de-france/paris-75/paris-75000/3',
    ];

    expect(pickExposeLink(links, 'seloger')).toBe(links[1]);
  });

  it("does not take the other portal's advert", () => {
    expect(pickExposeLink(['https://www.seloger.com/annonce/location/x/1'], 'immowelt')).toBeNull();
    expect(pickExposeLink(['https://www.immowelt.at/expose/1'], 'immowelt')).toBe('https://www.immowelt.at/expose/1');
  });

  it('has no link to offer for none', () => {
    expect(pickExposeLink([null, undefined, 'not a url'], 'seloger')).toBeNull();
  });
});
