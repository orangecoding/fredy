/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/seloger.js';
import { normalizeClassified, readFigure, readTitlePrice } from '../../lib/services/immowelt/classified.js';
import { launchBrowser, closeBrowser } from '../../lib/services/extractor/puppeteerExtractor.js';
import { fetchExposeHtml, releaseSession } from '../../lib/services/immowelt/immoweltBff.js';
import { hostsOf } from '../../lib/services/jobs/providerUrl.js';

// One browser for the whole suite, as for immowelt: the session is the expensive part, and the
// search and the exposé fetch share it.
const TEST_TIMEOUT = 180_000;

describe('#seloger testsuite()', () => {
  let browser;
  let runConfig;
  let liveListings;

  beforeAll(async () => {
    browser = await launchBrowser(providerConfig.seloger.url);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await releaseSession(browser);
    await closeBrowser(browser);
  });

  it(
    'should test seloger provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = { id: 'seloger', notificationAdapter: null, spatialFilter: null, specFilter: null };
      runConfig = provider.createConfig(providerConfig.seloger, []);

      const fredy = new Fredy(runConfig, mockedJob, provider.metaInformation.id, similarityCache, browser);
      liveListings = await fredy.execute();

      if (liveListings == null || liveListings.length === 0) {
        throw new Error('Listings is empty!');
      }

      const notificationObj = get();
      expect(notificationObj.serviceName).toBe('seloger');
      notificationObj.payload.forEach((notify) => {
        expect(notify.id).toBeTypeOf('string');
        expect(notify.title).not.toBe('');
        // SeLoger lists the adverts of Belles Demeures, its luxury sister portal, among its own, and
        // their cards link to the sister's site.
        expect(notify.link).toMatch(/^https:\/\/www\.(seloger|bellesdemeures)\.com\//);
        expect(notify.address).not.toBe('');
        if (notify.price != null) expect(notify.price).toContain('€');
      });
    },
    TEST_TIMEOUT,
  );

  // The card spells its figures the French way - "1 190 €", with a narrow no-break space - and
  // reading that the German way is a rent of 1.
  it('reads the French figures as the figures they are', () => {
    if (!liveListings?.length) throw new Error('No listings from the first test to inspect');
    for (const listing of liveListings) {
      if (listing.price != null) expect(listing.price).toBeGreaterThan(100);
    }
  });

  it(
    'enriches a listing from its exposé',
    async () => {
      if (!liveListings?.length) throw new Error('No listings from the first test to enrich');
      const listing = liveListings.find((candidate) => candidate.link.startsWith('https://www.seloger.com/'));
      const enriched = await runConfig.fetchDetails(listing, browser);

      expect(enriched.link).toContain('https://www.seloger.com/annonce/');
      if (enriched.description != null) expect(enriched.description).toBeTypeOf('string');
    },
    TEST_TIMEOUT,
  );

  it('refuses a landing page, whose search is in its path', async () => {
    await expect(
      runConfig.getListings('https://www.seloger.com/recherche/location/appartement/france/ad02fr1', browser),
    ).rejects.toThrow(/landing pages/);
  });

  // The two portals share one BFF, so an immowelt url would be searched without complaint - and its
  // German flats stored as SeLoger's.
  it("refuses immowelt's urls, which the shared BFF would search without complaint", async () => {
    await expect(
      runConfig.getListings('https://www.immowelt.de/classified-search?locations=AD08DE8634', browser),
    ).rejects.toThrow(/SeLoger serves seloger\.com/);
  });
});

describe('#seloger card', () => {
  const card = (price, priceFacts = {}) => ({
    id: '26ABC',
    url: 'https://www.seloger.com/annonce/location/ile-de-france/paris-75/paris-75000/26ABC',
    hardFacts: {
      price: { value: price, ...priceFacts },
      facts: [
        { type: 'numberOfRooms', splitValue: '2' },
        { type: 'livingSpace', splitValue: '43,12' },
      ],
    },
    mainDescription: { headline: 'Appartement 2 pièces', description: 'Au cœur du Marais' },
    location: { address: { city: 'Paris 3ème arrondissement', zipCode: '75003', district: 'Archives' } },
    tracking: { city: 'Paris' },
    metadata: { creationDate: '2026-09-25T17:47:00Z' },
  });

  it('reads a price grouped with the narrow no-break space SeLoger writes', () => {
    expect(normalizeClassified(card('1 860 €')).price).toBe(1860);
    expect(normalizeClassified(card('1 250 000 €')).price).toBe(1250000);
  });

  it('still reads the German spelling immowelt writes', () => {
    expect(readFigure('1.250 €')).toBe(1250);
    expect(readFigure('72,4')).toBe(72.4);
  });

  it('reads the decimal comma of an area', () => {
    expect(normalizeClassified(card('1 860 €')).size).toBe(43.12);
  });

  it('names the town next to the district, which alone would geocode anywhere', () => {
    expect(normalizeClassified(card('1 860 €')).address).toBe('75003 Archives, Paris');
  });

  // SeLoger quotes a rent per advert either charges comprises or hors charges, and says which on
  // the card; immowelt names its figure a Kaltmiete. The recorded cards are two of one and three of
  // the other, so the stored rents are both - and have to say so.
  it('says whether the rent has the charges in it, the way the card does', () => {
    expect(normalizeClassified(card('1 190 €', { chargesLabel: 'cc' })).chargesIncluded).toBe(true);
    expect(normalizeClassified(card('2 345 €', { chargesLabel: 'hc' })).chargesIncluded).toBe(false);
    expect(normalizeClassified(card('1.250 €', { addition: { value: 'Kaltmiete' } })).chargesIncluded).toBe(false);
    expect(normalizeClassified(card('1.450 €', { addition: { value: 'Warmmiete' } })).chargesIncluded).toBe(true);
  });

  it('says nothing about a figure the card does not label as a rent', () => {
    expect(normalizeClassified(card('350 000 €')).chargesIncluded).toBeUndefined();
    expect(
      normalizeClassified(card('2.474.300 €', { addition: { value: '4.651 €/m²' } })).chargesIncluded,
    ).toBeUndefined();
  });
});

describe('#seloger price probe', () => {
  const page = (title) => `<html><head><meta property="og:title" content="${title}"></head></html>`;

  it('reads the headline price out of the exposé title, past the area in front of it', () => {
    expect(readTitlePrice(page('Appartement à louer T2/F2 43 m² 1860 € Archives Paris (75003)'))).toBe('1860');
  });

  it('reads a price whose thousands are spaced', () => {
    expect(readTitlePrice(page('Maison à vendre 5 pièces 120 m² 1 250 000 € Lyon (69003)'))).toBe('1250000');
  });

  it("still reads immowelt's titles", () => {
    expect(readTitlePrice(page('Haus 532 m² 2474300 € zum Kauf Berlin'))).toBe('2474300');
    expect(readTitlePrice(page('Wohnung 93 m² 1.250 € zur Miete Mitte,Berlin (10178)'))).toBe('1.250');
  });

  // A title without an area puts the room code right in front of the price. Letting the digit
  // groups run across any space glued the "2" of "F2" onto it: a rent of 21 190 €, recorded as the
  // listing's new price with a notification about a 1 680 % increase.
  it('keeps a number in front of the price out of it', () => {
    expect(readTitlePrice(page('Appartement à louer T2/F2 1190 € Vallée de Fécamp Paris (75012)'))).toBe('1190');
    expect(readTitlePrice(page('Maison à vendre T5/F5 450 000 € Lyon (69003)'))).toBe('450000');
    expect(readTitlePrice(page('Wohnung 3 1250 € zur Miete'))).toBe('1250');
  });

  it('has no price for a title without one', () => {
    expect(readTitlePrice(page('Appartement à louer'))).toBeNull();
  });
});

// Offline, the transport is replaced by the recordings. It has to refuse what production refuses,
// or an offline test passes on an exposé no run would ever read.
describe('#seloger offline exposé', () => {
  it.runIf(process.env.TEST_MODE === 'offline')('serves no exposé for a link production would not fetch', async () => {
    expect(await fetchExposeHtml(null, 'https://www.bellesdemeures.com/annonces/vente/appartement/1.htm')).toBeNull();
    expect(await fetchExposeHtml(null, 'https://www.example.org/expose/1')).toBeNull();
  });

  it.runIf(process.env.TEST_MODE === 'offline')("serves SeLoger's own recording for a SeLoger link", async () => {
    const html = await fetchExposeHtml(null, 'https://www.seloger.com/annonce/location/x/paris-75000/2656V5QWWXYC');
    expect(html).toContain('Vallée de Fécamp');
  });
});

describe('#seloger metaInformation', () => {
  it('serves France, on seloger.com alone', () => {
    expect(provider.metaInformation.countries).toEqual(['fr']);
    expect(hostsOf(provider.metaInformation)).toEqual(['seloger.com']);
    expect(provider.metaInformation.baseUrl).toBe('https://www.seloger.com/');
  });
});
