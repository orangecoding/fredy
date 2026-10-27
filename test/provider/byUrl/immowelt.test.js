/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

import { buildHash } from '../../../lib/utils.js';
import { expectComplete, fixture } from './contract.js';

vi.mock('../../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn(async () => {}) }));
vi.mock('../../../lib/services/logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const immowelt = await import('../../../lib/provider/immowelt.js');
const seloger = await import('../../../lib/provider/seloger.js');
const { normalizeClassified } = await import('../../../lib/services/immowelt/classified.js');

/**
 * `fetchListingByUrl` of immowelt and SeLoger, which run on one platform and share the code that
 * reads an exposé (`services/immowelt/classified.js`). See `contract.js`.
 *
 * The exposé is fetched from inside the warmed browser session, so the browser here is a fake whose
 * page answers every in-page request through `handler`, the way the transport's own tests drive it.
 * `gotos` records the warm-up navigation, which is a request to the portal as much as the fetch is.
 *
 * @param {(url: string) => {status: number, body: string}} handler
 * @returns {{browser: any, requests: string[], gotos: string[]}}
 */
function fakeBrowser(handler) {
  const requests = [];
  const gotos = [];
  const page = {
    isClosed: () => false,
    goto: async (url) => {
      gotos.push(String(url));
    },
    waitForFunction: async () => {},
    close: async () => {},
    evaluate: async (fn, ...args) => {
      const original = globalThis.fetch;
      globalThis.fetch = async (url) => {
        requests.push(String(url));
        const { status, body } = handler(String(url));
        return { status, text: async () => body };
      };
      try {
        return await fn(...args);
      } finally {
        globalThis.fetch = original;
      }
    },
  };
  return { browser: { newPage: async () => page }, requests, gotos };
}

/** A browser answering every exposé with one recorded page. */
const serving = (name) => fakeBrowser(() => ({ status: 200, body: fixture(name) }));

describe('immowelt', () => {
  const LEGACY_ID = '8e1049f3-8f9e-481d-a666-a635fba60191';
  const EXPOSE = `https://www.immowelt.de/expose/${LEGACY_ID}`;
  // The search run's hash: the classified id over `hardFacts.price.value` as the platform spells it,
  // with a no-break space before the sign. The recorded immowelt cards were trimmed by hand and have
  // lost theirs; SeLoger's, recorded as they came, carry them on card and exposé alike.
  const HASH = buildHash('26H6IGH14AAQ', '2.474.300\u00a0€');

  it('reads the exposé into the listing a search run stores', async () => {
    const { browser, requests, gotos } = serving('immowelt_detail_serverstate.html');
    const listing = await immowelt.config.fetchListingByUrl(EXPOSE, browser);

    expectComplete(listing);
    expect(gotos).toEqual(['https://www.immowelt.de/']);
    expect(requests).toEqual([EXPOSE]);

    // The recorded search holds other adverts than the recorded exposé, so parity is shown on the
    // inputs: every card links `/expose/{legacy id}` on the site's origin, and the hash is the
    // classified id over the headline figure as the card spells it.
    for (const card of JSON.parse(fixture('immowelt_classifieds.json'))) {
      expect(card.url).toBe(`https://www.immowelt.de/expose/${card.metadata.legacyId}`);
      expect(normalizeClassified(card).id).toBe(buildHash(card.id, card.hardFacts.price.value));
    }
    expect(listing.link).toBe(EXPOSE);
    expect(listing.id).toBe(HASH);

    expect(listing).toMatchObject({
      title: 'Investorenprojekt! Hochmodernes Mehrfamilienhaus mit 6 Wohnungen (KfW 40 + QNG)',
      price: 2474300,
      address: 'Christian-Rath-Straße 2, 48336 Sassenberg',
      latitude: 51.98283386230469,
      longitude: 8.038257598876953,
      buildYear: 2026,
      energyClass: 'A+',
      publishedAt: Date.parse('2026-03-05T14:49:48.317Z'),
    });
    expect(listing.images.length).toBeGreaterThan(0);
    expect(listing.image).toBe(listing.images[0].url);
    // The exposé's full description, all three blocks, not the card's first 500 characters.
    expect(listing.description).toContain('Massivbauweise');
    expect(listing.description).toContain('Sonstiges');
  });

  it('settles on the canonical link whatever the shared one carried', async () => {
    const { browser, requests } = serving('immowelt_detail_serverstate.html');
    const listing = await immowelt.config.fetchListingByUrl(
      `http://immowelt.de/expose/${LEGACY_ID}/?utm_source=x#top`,
      browser,
    );

    expect(listing.link).toBe(EXPOSE);
    // Fetched on the warmed page's own origin: anything else is a cross-origin request the browser refuses.
    expect(requests).toEqual([EXPOSE]);
  });

  // The exposé also answers to the classified id. Its canonical url is the legacy-id one the cards
  // link with, and storing the other spelling would store the advert a second time on the next run.
  it('takes the link the cards use from the exposé, not from the url pasted', async () => {
    const { browser } = serving('immowelt_detail_serverstate.html');
    const listing = await immowelt.config.fetchListingByUrl('https://www.immowelt.de/expose/26H6IGH14AAQ', browser);

    expect(listing.link).toBe(EXPOSE);
    expect(listing.id).toBe(HASH);
  });

  it('keeps an Austrian exposé on its own site', async () => {
    const { browser, requests, gotos } = serving('immowelt_detail_serverstate.html');
    const listing = await immowelt.config.fetchListingByUrl('https://www.immowelt.at/expose/26H6IGH14AAQ', browser);

    expect(gotos).toEqual(['https://www.immowelt.at/']);
    expect(requests).toEqual(['https://www.immowelt.at/expose/26H6IGH14AAQ']);
    // The recorded page's canonical url is on immowelt.de, which is not the site it was pasted on.
    expect(listing.link).toBe('https://www.immowelt.at/expose/26H6IGH14AAQ');
    expect(listing.id).toBe(HASH);
  });

  it('answers null for a URL that names no exposé, without asking the portal', async () => {
    const { browser, requests, gotos } = serving('immowelt_detail_serverstate.html');

    for (const url of [
      'https://www.immowelt.de/',
      'https://www.immowelt.de/classified-search?distributionTypes=Rent&estateTypes=Apartment&locations=AD08DE8634',
      'https://www.immowelt.de/suche/kaufen/haus/deutschland/ad02de1',
      'https://www.immowelt.de/expose/',
      'https://www.immowelt.de/expose/abc/bilder',
      // SeLoger's, which immowelt does not serve.
      'https://www.seloger.com/annonce/location/ile-de-france/paris-75/paris-75000/2656V5QWWXYC',
      'https://www.example.org/expose/1',
      'not a url',
    ]) {
      expect(await immowelt.config.fetchListingByUrl(url, browser)).toBeNull();
    }
    expect(requests).toEqual([]);
    expect(gotos).toEqual([]);
  });

  it('answers null when the exposé is refused, gone, or carries no state', async () => {
    for (const answer of [
      { status: 403, body: 'Please enable JS' },
      { status: 410, body: '<html>gone</html>' },
      { status: 200, body: '<html><body>nothing here</body></html>' },
      // An exposé without its embedded state: the title alone holds no hash a search would compute.
      { status: 200, body: fixture('immowelt_detail.html') },
    ]) {
      const { browser } = fakeBrowser(() => answer);
      expect(await immowelt.config.fetchListingByUrl(EXPOSE, browser)).toBeNull();
    }
  });

  it('resolves null when the browser itself fails', async () => {
    const browser = { newPage: async () => Promise.reject(new Error('browser disconnected')) };
    expect(await immowelt.config.fetchListingByUrl(EXPOSE, browser)).toBeNull();
  });
});

describe('seloger', () => {
  const ID = '2656V5QWWXYC';
  const EXPOSE = `https://www.seloger.com/annonce/location/ile-de-france/paris-75/paris-75000/${ID}`;

  it('reads the exposé into the listing a search run stores', async () => {
    const { browser, requests, gotos } = serving('seloger_detail.html');
    const listing = await seloger.config.fetchListingByUrl(EXPOSE, browser);

    expectComplete(listing);
    expect(gotos).toEqual(['https://www.seloger.com/']);
    expect(requests).toEqual([EXPOSE]);

    // The same advert sits in the recorded search, so what a run stores for it is known exactly.
    const card = JSON.parse(fixture('seloger_classifieds.json')).find((entry) => entry.id === ID);
    const searched = normalizeClassified(card);
    expect(listing.id).toBe(searched.id);
    expect(listing.link).toBe(searched.link);
    for (const key of [
      'title',
      'price',
      'chargesIncluded',
      'size',
      'rooms',
      'address',
      'image',
      'images',
      'publishedAt',
    ]) {
      expect(listing[key]).toEqual(searched[key]);
    }

    expect(listing).toMatchObject({
      title: '2 PIECES - RUE WATTIGNIES',
      price: 1190,
      chargesIncluded: true,
      size: 37,
      rooms: 2,
      address: '75012 Vallée de Fécamp, Paris',
      latitude: 48.83660310005011,
      longitude: 2.392940338675138,
      energyClass: 'E',
    });
    expect(listing.description).toContain('rue de Wattignies');
  });

  it('settles on the canonical link whatever the shared one carried', async () => {
    const { browser, requests } = serving('seloger_detail.html');
    const listing = await seloger.config.fetchListingByUrl(
      `http://seloger.com/annonce/location/ile-de-france/paris-75/paris-75000/${ID}/?m=search_to_detail&utm_source=share#photos`,
      browser,
    );

    expect(listing.link).toBe(EXPOSE);
    expect(requests).toEqual([EXPOSE]);
  });

  // SeLoger's exposé names no canonical url, so the link is the pasted path - which only holds as
  // long as that path names the advert the page carries.
  it('answers null when the page holds another advert than the url names', async () => {
    const { browser } = serving('seloger_detail.html');
    const other = 'https://www.seloger.com/annonce/location/ile-de-france/paris-75/paris-75000/26Z3Q68E7H6C';

    expect(await seloger.config.fetchListingByUrl(other, browser)).toBeNull();
  });

  it('answers null for a URL that names no exposé, without asking the portal', async () => {
    const { browser, requests, gotos } = serving('seloger_detail.html');

    for (const url of [
      'https://www.seloger.com/',
      'https://www.seloger.com/classified-search?distributionTypes=Rent&estateTypes=Apartment&locations=AD08FR31096',
      'https://www.seloger.com/recherche/location/appartement/france/ad02fr1',
      'https://www.seloger.com/annonce/',
      'https://www.seloger.com/annonce/location/',
      // The sister portals' adverts are listed among SeLoger's, but their exposés are not the platform's to read.
      'https://www.bellesdemeures.com/annonces/vente/paris-75/1.htm',
      'https://www.seloger-bureaux-commerces.com/annonce/detail/direct/281511653',
      // immowelt's, which SeLoger does not serve.
      'https://www.immowelt.de/expose/8e1049f3-8f9e-481d-a666-a635fba60191',
      'not a url',
    ]) {
      expect(await seloger.config.fetchListingByUrl(url, browser)).toBeNull();
    }
    expect(requests).toEqual([]);
    expect(gotos).toEqual([]);
  });

  it('answers null when the exposé is refused or gone', async () => {
    for (const answer of [
      { status: 403, body: 'Please enable JS' },
      { status: 404, body: '<html>not found</html>' },
    ]) {
      const { browser } = fakeBrowser(() => answer);
      expect(await seloger.config.fetchListingByUrl(EXPOSE, browser)).toBeNull();
    }
  });
});
