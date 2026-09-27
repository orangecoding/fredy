/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/bienici.js';

/** Bien'ici is read through plain JSON endpoints, so there is no browser in play. */
const TEST_TIMEOUT = 120_000;

/** One advert in the shape `realEstateAds.json` answers with. */
const ad = (overrides = {}) => ({
  id: 'immo-facile-1',
  adType: 'rent',
  propertyType: 'flat',
  title: 'Beau 2 pièces',
  description: 'Première ligne<br>Deuxième ligne &amp; fin',
  price: 1200,
  charges: 100,
  surfaceArea: 40,
  roomsQuantity: 2,
  postalCode: '75011',
  city: 'Paris 11e',
  district: { libelle: 'Bastille - Popincourt' },
  publicationDate: '2026-09-25T17:51:32.054Z',
  photos: [{ url: 'https://file.bienici.com/photo/1.jpg' }],
  blurInfo: { type: 'disk', position: { lat: 48.85, lon: 2.37 } },
  ...overrides,
});

describe('#bienici testsuite()', () => {
  let liveListings;

  it(
    'should test bienici provider',
    async () => {
      const Fredy = await mockFredy();
      const runConfig = provider.createConfig(providerConfig.bienici, []);
      const mockedJob = { id: 'bienici', notificationAdapter: null, spatialFilter: null, specFilter: null };

      const fredy = new Fredy(runConfig, mockedJob, provider.metaInformation.id, similarityCache, undefined);
      liveListings = await fredy.execute();

      if (liveListings == null || liveListings.length === 0) {
        throw new Error('Listings is empty!');
      }

      const notificationObj = get();
      expect(notificationObj.serviceName).toBe('bienici');
      notificationObj.payload.forEach((notify) => {
        expect(notify.id).toBeTypeOf('string');
        expect(notify.title).toBeTypeOf('string');
        expect(notify.title).not.toBe('');
        expect(notify.link).toMatch(/^https:\/\/www\.bienici\.com\/annonce\//);
        expect(notify.address).toBeTypeOf('string');
        expect(notify.address).not.toBe('');
        if (notify.price != null) expect(notify.price).toContain('€');
      });
    },
    TEST_TIMEOUT,
  );

  // Bien'ici never publishes a street, but it hands out a point for every advert - which is what
  // keeps these listings out of the geocoder altogether.
  it('places the listings on the map without the geocoder', () => {
    if (!liveListings?.length) throw new Error('No listings from the first test to inspect');
    expect(liveListings.every((listing) => Number.isFinite(listing.latitude))).toBe(true);
    expect(liveListings.every((listing) => Number.isFinite(listing.longitude))).toBe(true);
  });

  it(
    'reads an advert that is gone as gone',
    async () => {
      expect(await provider.config.activityProbe('https://www.bienici.com/annonce/fredy-does-not-exist-1')).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it('answers "no idea" for a link that names no advert', async () => {
    expect(await provider.config.activityProbe('https://www.example.org/')).toBe(-1);
  });
});

describe('#bienici offline probes', () => {
  // The recording holds exactly one advert's endpoint, so the positive answers can only be asserted
  // against it - live, any advert would do, but which one is still up is not something a test knows.
  it.runIf(process.env.TEST_MODE === 'offline')('reads a live advert as live, and its price as stored', async () => {
    const link = 'https://www.bienici.com/annonce/immo-facile-61560394';
    expect(await provider.config.activityProbe(link)).toBe(1);
    // 2 450 € charges comprises, 285 € of it charges: the probe must see what the search stored.
    expect(await provider.config.priceTracking.probe({ link })).toBe(2165);
  });

  it.runIf(process.env.TEST_MODE === 'offline')('reads the long link the site writes as well', async () => {
    const link = 'https://www.bienici.com/annonce/location/paris-7e/appartement/2pieces/immo-facile-61560394';
    expect(await provider.config.activityProbe(link)).toBe(1);
  });
});

describe('#bienici price', () => {
  it("takes the advertiser's own rent without charges where it is stated", () => {
    expect(provider.readPrice(ad({ price: 6000, charges: 500, rentWithoutCharges: 5067 }))).toBe(5067);
  });

  // Recorded advert immo-facile-61560389, rent-controlled: 6 000 € charges comprises, 500 € of it
  // charges, and `rentWithoutCharges` is only the capped base rent. The 433 € complément de loyer on
  // top of it is rent the tenant pays every month - the deposit of 5 500 € is one month of it - so
  // leaving it out stored the flat 8 % cheaper than it is.
  it('adds the rent supplement back onto a base rent stated without it', () => {
    expect(provider.readPrice(ad({ price: 6000, charges: 500, rentExtra: 433, rentWithoutCharges: 5067 }))).toBe(5500);
  });

  it('distrusts a stated rent that comes out above the rent charges included', () => {
    expect(provider.readPrice(ad({ price: 1200, charges: 100, rentWithoutCharges: 1500 }))).toBe(1100);
    expect(provider.readPrice(ad({ price: 1200, charges: 100, rentExtra: 300, rentWithoutCharges: 1000 }))).toBe(1100);
  });

  it('subtracts the charges from a rent quoted charges included', () => {
    expect(provider.readPrice(ad({ price: 1200, charges: 100 }))).toBe(1100);
  });

  it('keeps a rent whose charges cannot be its monthly charges', () => {
    expect(provider.readPrice(ad({ price: 1200, charges: 1500 }))).toBe(1200);
    expect(provider.readPrice(ad({ price: 1200, charges: null }))).toBe(1200);
  });

  it('leaves a sale price alone, charges or not', () => {
    expect(provider.readPrice(ad({ adType: 'buy', price: 350000, charges: 1200 }))).toBe(350000);
  });

  it('reads a new-build programme at the price it is advertised with, its smallest', () => {
    expect(provider.readPrice(ad({ adType: 'buy', price: [250000, 480000] }))).toBe(250000);
  });

  it('has no price for an advert without one', () => {
    expect(provider.readPrice(ad({ price: 0 }))).toBeNull();
    expect(provider.readPrice(ad({ price: undefined }))).toBeNull();
  });
});

describe('#bienici normalize', () => {
  it('reads an advert into a listing', () => {
    const listing = provider.config.normalize(ad());

    expect(listing.link).toBe('https://www.bienici.com/annonce/immo-facile-1');
    expect(listing.price).toBe(1100);
    expect(listing.size).toBe(40);
    expect(listing.rooms).toBe(2);
    expect(listing.address).toBe('Bastille - Popincourt, 75011 Paris 11e');
    expect(listing.image).toBe('https://file.bienici.com/photo/1.jpg');
    expect(listing.publishedAt).toBe(Date.UTC(2026, 8, 25, 17, 51, 32, 54));
    expect(listing.latitude).toBe(48.85);
    expect(listing.longitude).toBe(2.37);
  });

  it('keeps the line breaks the endpoint writes as markup, and decodes its entities', () => {
    expect(provider.config.normalize(ad()).description).toBe('Première ligne\nDeuxième ligne & fin');
  });

  // Without the break the two paragraphs run together as "calmeBail", and a blacklist term at the
  // start of the second one never matches.
  it('keeps paragraphs apart', () => {
    expect(provider.config.normalize(ad({ description: '<p>Loft calme</p><p>Bail mobilité</p>' })).description).toBe(
      'Loft calme\n\nBail mobilité',
    );
  });

  it('names an advert without a headline after what it is', () => {
    expect(provider.config.normalize(ad({ title: '  ' })).title).toBe('Appartement 2 pièces 40 m² Paris 11e');
  });

  it('hashes the id together with the price, so a price change reads as a new advert', () => {
    const before = provider.config.normalize(ad());
    const after = provider.config.normalize(ad({ price: 1300 }));
    expect(before.id).not.toBe(after.id);
  });

  it('reads the building facts the advert states', () => {
    const listing = provider.config.normalize(ad({ yearOfConstruction: 1972, energyClassification: 'D' }));
    expect(listing.buildYear).toBe(1972);
    expect(listing.energyClass).toBe('D');
  });
});

// What the stored rent is on - with the charges or without - and what they come to.
describe('#bienici rent basis', () => {
  const basis = (listing) => ({ chargesIncluded: listing.chargesIncluded, charges: listing.charges });

  it('stores a rent the charges were taken out of as one without them, and what they came to', () => {
    expect(basis(provider.config.normalize(ad()))).toEqual({ chargesIncluded: false, charges: 100 });
    expect(
      basis(provider.config.normalize(ad({ price: 6000, charges: 500, rentExtra: 433, rentWithoutCharges: 5067 }))),
    ).toEqual({ chargesIncluded: false, charges: 500 });
  });

  // Bien'ici quotes every rent charges comprises; one whose charges are missing stays that way.
  it('stores a rent it could not take the charges out of as one with them', () => {
    expect(basis(provider.config.normalize(ad({ charges: null })))).toEqual({
      chargesIncluded: true,
      charges: undefined,
    });
  });

  it('says nothing about the price of a sale', () => {
    expect(basis(provider.config.normalize(ad({ adType: 'buy', price: 350000, charges: 1200 })))).toEqual({
      chargesIncluded: undefined,
      charges: undefined,
    });
  });
});

describe('#bienici metaInformation', () => {
  it('serves France', () => {
    expect(provider.metaInformation.countries).toEqual(['fr']);
    expect(provider.metaInformation.baseUrl).toBe('https://www.bienici.com/');
  });
});
