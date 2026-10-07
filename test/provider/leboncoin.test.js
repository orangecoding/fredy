/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/leboncoin.js';
import { launchBrowser, closeBrowser } from '../../lib/services/extractor/puppeteerExtractor.js';
import { releaseSession } from '../../lib/services/leboncoin/finder.js';

// The finder endpoint only answers a page on www.leboncoin.fr, so the suite shares one browser and
// the one warm-up navigation it costs.
const TEST_TIMEOUT = 180_000;

/** One advert in the shape `finder/search` answers with. */
const ad = ({ price = 1190, attributes = {}, ...overrides } = {}) => ({
  list_id: 3276619393,
  first_publication_date: '2026-09-25 20:27:35',
  subject: '  Appartement 2 pièces 35 m²  ',
  body: 'Lumineux, proche métro.',
  url: 'https://www.leboncoin.fr/ad/locations/3276619393',
  price: [price],
  images: { urls_large: ['https://img.leboncoin.fr/large.jpg'], urls: ['https://img.leboncoin.fr/normal.jpg'] },
  location: { city: 'Paris', zipcode: '75012', district: 'Nation - Picpus', lat: 48.84, lng: 2.39 },
  attributes: Object.entries({
    square: '35',
    rooms: '2',
    charges_included: '1',
    rent_excluding_charges: '1140',
    monthly_charges: '50',
    energy_rate: 'd',
    ...attributes,
  })
    .filter(([, value]) => value != null)
    .map(([key, value]) => ({ key, value })),
  ...overrides,
});

describe('#leboncoin testsuite()', () => {
  let browser;
  let liveListings;

  beforeAll(async () => {
    browser = await launchBrowser(providerConfig.leboncoin.url);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await releaseSession(browser);
    await closeBrowser(browser);
  });

  it(
    'should test leboncoin provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = { id: 'leboncoin', notificationAdapter: null, spatialFilter: null, specFilter: null };
      const runConfig = provider.createConfig(providerConfig.leboncoin, []);

      const fredy = new Fredy(runConfig, mockedJob, provider.metaInformation.id, similarityCache, browser);
      liveListings = await fredy.execute();

      if (liveListings == null || liveListings.length === 0) {
        throw new Error('Listings is empty!');
      }

      const notificationObj = get();
      expect(notificationObj.serviceName).toBe('leboncoin');
      notificationObj.payload.forEach((notify) => {
        expect(notify.id).toBeTypeOf('string');
        expect(notify.title).not.toBe('');
        expect(notify.link).toMatch(/^https:\/\/www\.leboncoin\.fr\/ad\//);
        expect(notify.address).not.toBe('');
        if (notify.price != null) expect(notify.price).toContain('€');
      });
    },
    TEST_TIMEOUT,
  );

  it('places the listings on the map without the geocoder', () => {
    if (!liveListings?.length) throw new Error('No listings from the first test to inspect');
    expect(liveListings.every((listing) => Number.isFinite(listing.latitude))).toBe(true);
  });
});

describe('#leboncoin price', () => {
  it("takes the advertiser's rent without charges from a rent quoted with them", () => {
    expect(provider.readPrice(ad())).toBe(1140);
  });

  it('subtracts the monthly charges where that is all the advertiser stated', () => {
    expect(provider.readPrice(ad({ attributes: { rent_excluding_charges: null } }))).toBe(1140);
  });

  it('takes a rent that excludes the charges already at its word', () => {
    expect(provider.readPrice(ad({ attributes: { charges_included: '2' } }))).toBe(1190);
  });

  it('keeps a rent whose stated figures cannot be read', () => {
    const nonsense = { rent_excluding_charges: '9999', monthly_charges: '5000' };
    expect(provider.readPrice(ad({ attributes: nonsense }))).toBe(1190);
  });

  it('leaves a sale price alone', () => {
    const sale = ad({ price: 350000, attributes: { charges_included: null, rent_excluding_charges: null } });
    expect(provider.readPrice(sale)).toBe(350000);
  });

  it('has no price for an advert without one', () => {
    expect(provider.readPrice(ad({ price: null }))).toBeNull();
  });
});

describe('#leboncoin normalize', () => {
  it('reads an advert into a listing', () => {
    const listing = provider.config.normalize(ad());

    expect(listing.title).toBe('Appartement 2 pièces 35 m²');
    expect(listing.link).toBe('https://www.leboncoin.fr/ad/locations/3276619393');
    expect(listing.price).toBe(1140);
    expect(listing.size).toBe(35);
    expect(listing.rooms).toBe(2);
    expect(listing.address).toBe('Nation - Picpus, 75012 Paris');
    expect(listing.image).toBe('https://img.leboncoin.fr/large.jpg');
    expect(listing.description).toBe('Lumineux, proche métro.');
    expect(listing.energyClass).toBe('D');
    expect(listing.latitude).toBe(48.84);
    expect(listing.longitude).toBe(2.39);
  });

  // leboncoin writes Paris wall clock without saying so: two hours ahead of UTC in summer, one in
  // winter. Read as UTC, an advert posted this evening would sit in the future.
  it('reads the publication date as the Paris wall clock it is', () => {
    expect(provider.config.normalize(ad()).publishedAt).toBe(Date.UTC(2026, 8, 25, 18, 27, 35));
    expect(provider.config.normalize(ad({ first_publication_date: '2026-01-15 10:00:00' })).publishedAt).toBe(
      Date.UTC(2026, 0, 15, 9, 0, 0),
    );
  });

  it('has no publication date for a stamp it cannot read', () => {
    expect(provider.config.normalize(ad({ first_publication_date: 'hier' })).publishedAt).toBeUndefined();
  });

  it('hashes the id together with the price, so a price change reads as a new advert', () => {
    const before = provider.config.normalize(ad());
    const after = provider.config.normalize(ad({ attributes: { rent_excluding_charges: '1100' } }));
    expect(before.id).not.toBe(after.id);
  });
});

// What the stored rent is on - with the charges or without - and what they come to. It is what lets
// the same flat quoted charges comprises on another portal be recognised as the same flat.
describe('#leboncoin rent basis', () => {
  const basis = (listing) => ({ chargesIncluded: listing.chargesIncluded, charges: listing.charges });

  it('stores a rent the charges were taken out of as one without them, and what they came to', () => {
    expect(basis(provider.config.normalize(ad()))).toEqual({ chargesIncluded: false, charges: 50 });
    expect(basis(provider.config.normalize(ad({ attributes: { monthly_charges: null } })))).toEqual({
      chargesIncluded: false,
      charges: 50,
    });
  });

  it('stores a rent quoted with the charges and nothing to take them out as one with them', () => {
    const quotedOnly = ad({ attributes: { rent_excluding_charges: null, monthly_charges: null } });
    expect(basis(provider.config.normalize(quotedOnly))).toEqual({ chargesIncluded: true, charges: undefined });
  });

  it('stores a rent quoted without the charges as one without them', () => {
    const withoutCharges = ad({ attributes: { charges_included: '2', rent_excluding_charges: null } });
    expect(basis(provider.config.normalize(withoutCharges))).toEqual({ chargesIncluded: false, charges: 50 });
  });

  it('says nothing about the price of a sale', () => {
    const sale = ad({
      price: 350000,
      attributes: { charges_included: null, rent_excluding_charges: null, monthly_charges: null },
    });
    expect(basis(provider.config.normalize(sale))).toEqual({ chargesIncluded: undefined, charges: undefined });
  });
});

describe('#leboncoin price range', () => {
  const parse = provider.config.priceRangeParams.parse;

  it('reads both bounds out of the one parameter that holds them', () => {
    expect(parse('https://www.leboncoin.fr/recherche?category=10&price=500-1000')).toEqual({ min: 500, max: 1000 });
  });

  it('reads an open bound as no bound', () => {
    expect(parse('https://www.leboncoin.fr/recherche?category=10&price=min-1500')).toEqual({ min: null, max: 1500 });
    expect(parse('https://www.leboncoin.fr/recherche?category=10&price=500-max')).toEqual({ min: 500, max: null });
    expect(parse('https://www.leboncoin.fr/recherche?category=10')).toEqual({ min: null, max: null });
  });

  it('reads a soft or a strict band like any other', () => {
    expect(parse('https://www.leboncoin.fr/recherche?category=10&price=min-1500-strict')).toEqual({
      min: null,
      max: 1500,
    });
    expect(parse('https://www.leboncoin.fr/recherche?category=10&price=500-1000-lax')).toEqual({ min: 500, max: 1000 });
  });

  // A value the search does not read as a range is no price band either; reporting one would
  // describe a search Fredy never ran.
  it('reports no band where the search applies none', () => {
    expect(parse('https://www.leboncoin.fr/recherche?category=10&price=1000')).toEqual({ min: null, max: null });
    expect(parse('https://www.leboncoin.fr/recherche?category=10&price=abc-1000')).toEqual({ min: null, max: null });
  });
});

describe('#leboncoin metaInformation', () => {
  it('serves France', () => {
    expect(provider.metaInformation.countries).toEqual(['fr']);
    expect(provider.metaInformation.baseUrl).toBe('https://www.leboncoin.fr/');
  });
});
