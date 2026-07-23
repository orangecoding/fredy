/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest';
// Import utils.js before puppeteerExtractor so its offline vi.mock (which stubs
// launchBrowser) is registered first; otherwise offline runs launch a real
// browser and fail when the CloakBrowser binary isn't cached (e.g. in CI).
import { mockFredy, providerConfig } from '../utils.js';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { closeBrowser, launchBrowser } from '../../lib/services/extractor/puppeteerExtractor.js';
import { get } from '../mocks/mockNotification.js';
import * as provider from '../../lib/provider/inberlinwohnen.js';
import { buildHash } from '../../lib/utils.js';

const offlineIt = process.env.TEST_MODE === 'offline' ? it : it.skip;
const liveIt = process.env.TEST_MODE === 'offline' ? it.skip : it;

const snapshot = (item, tuple = true) => ({
  id: JSON.stringify({ data: { item: tuple ? [item, { s: 'arr' }] : item } }),
});

describe('#inberlinwohnen testsuite()', () => {
  let browser;
  let liveListings = [];

  provider.init(providerConfig.inberlinwohnen, []);
  beforeAll(async () => {
    browser = await launchBrowser(providerConfig.inberlinwohnen.url);
  });
  afterAll(async () => {
    await closeBrowser(browser);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should parse listings from the Livewire snapshot', async () => {
    const Fredy = await mockFredy();
    const mockedJob = {
      id: 'inberlinwohnen',
      notificationAdapter: null,
      spatialFilter: null,
      specFilter: null,
    };
    const fredy = new Fredy(provider.config, mockedJob, provider.metaInformation.id, similarityCache, browser);

    const listings = await fredy.execute();
    if (process.env.TEST_MODE !== 'offline') liveListings = listings;

    expect(listings.length).toBeGreaterThan(0);
    const notification = get();
    expect(notification.serviceName).toBe('inberlinwohnen');
    expect(notification.payload.length).toBeGreaterThan(0);
    notification.payload.forEach((listing) => {
      expect(listing.id).toBeTypeOf('string');
      expect(listing.title).toBeTypeOf('string');
      expect(listing.title).not.toBe('');
      expect(listing.link).toMatch(/^https:\/\//);
      expect(listing.price).toMatch(/ €$/);
      expect(listing.size).toMatch(/ m²$/);
      expect(listing.rooms).toMatch(/ Zimmer$/);
      expect(listing.address).toContain('Berlin');
      if (listing.image) expect(listing.image).toContain('https://inberlinwohnen.de/img/images/apartments/');
      expect(listing.description).toContain('Gesamtmiete:');
    });
    expect(notification.payload.some((listing) => listing.image)).toBe(true);

    if (process.env.TEST_MODE === 'offline') {
      expect(notification.payload).toHaveLength(1);
      expect(notification.payload[0]).toMatchObject({
        title: 'Wohnung perfekt für Altbaufans',
        link: 'https://www.degewo.de/de/properties/W1100-41909-0008-0303.html',
        price: '600.37 €',
        size: '51.04 m²',
        rooms: '2 Zimmer',
        address: 'Firlstraße 31, 12459 Berlin, Treptow-Köpenick',
        image: 'https://inberlinwohnen.de/img/images/apartments/sample.webp?q=90&fit=crop&fm=png&dpr=1',
      });
      expect(notification.payload[0].description).toContain('WBS: unbekannt');
    }
  });

  liveIt('should enrich available live partner detail pages', async () => {
    const detailHosts = new Set(['berlinovo.de', 'degewo.de', 'gesobau.de', 'gewobag.de', 'howoge.de', 'wbm.de']);
    const samples = new Map();
    for (const listing of liveListings) {
      const hostname = new URL(listing.link).hostname.replace(/^www\./, '');
      if (detailHosts.has(hostname) && !samples.has(hostname)) samples.set(hostname, listing);
    }

    expect([...samples.keys()].sort()).toEqual([...detailHosts].sort());
    for (const listing of samples.values()) {
      const enriched = await provider.config.fetchDetails(listing, browser);
      expect(enriched.description.length).toBeGreaterThan(listing.description.length);
    }
  });

  offlineIt('should fetch every server-rendered result page', async () => {
    const item = (id) =>
      `<div wire:snapshot='${JSON.stringify({ data: { item: [{ id, title: `Listing ${id}`, deeplink: `/listing/${id}` }, { s: 'arr' }] } })}'></div>`;
    const page = (items, itemIds = null) => `<!doctype html><html><body>
      ${
        itemIds == null
          ? ''
          : `<div wire:snapshot='${JSON.stringify({ data: { itemIds: [itemIds, { s: 'arr' }], itemsPerPage: 2 } })}'></div>`
      }
      ${items.map(item).join('')}
    </body></html>`;
    const extractorMock = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2], [1, 2, 3, 4, 5]))
      .mockResolvedValueOnce(page([3, 4]))
      .mockResolvedValueOnce(page([5]));

    const listings = await provider.config.getListings(
      'https://inberlinwohnen.de/wohnungsfinder/?district=mitte&page=9',
      browser,
      extractorMock,
    );

    expect(listings).toHaveLength(5);
    expect(listings.map((listing) => JSON.parse(listing.id).data.item[0].id)).toEqual([1, 2, 3, 4, 5]);
    expect(extractorMock).toHaveBeenNthCalledWith(
      1,
      'https://inberlinwohnen.de/wohnungsfinder/?district=mitte&page=1',
      'body',
      {
        browser,
        name: 'inberlinwohnen',
      },
    );
    expect(extractorMock).toHaveBeenNthCalledWith(
      2,
      'https://inberlinwohnen.de/wohnungsfinder/?district=mitte&page=2',
      'body',
      { browser, name: 'inberlinwohnen' },
    );
    expect(extractorMock).toHaveBeenNthCalledWith(
      3,
      'https://inberlinwohnen.de/wohnungsfinder/?district=mitte&page=3',
      'body',
      { browser, name: 'inberlinwohnen' },
    );
  });

  offlineIt('should reject pages without recognizable Livewire search data', async () => {
    const extractorMock = vi.fn().mockResolvedValue(
      `<div wire:snapshot='${JSON.stringify({ data: { itemIds: [[1], { s: 'arr' }], itemsPerPage: 10 } })}'></div>
         <div wire:snapshot='${JSON.stringify({ data: { item: [{ id: 'unrelated' }, { s: 'arr' }] } })}'></div>`,
    );

    await expect(
      provider.config.getListings(providerConfig.inberlinwohnen.url, browser, extractorMock),
    ).rejects.toThrow('contained 0 of 1 expected listings');
  });

  offlineIt('should reject a later page that omits expected listings', async () => {
    const listing = `<div wire:snapshot='${JSON.stringify({
      data: { item: [{ id: 1, title: 'Listing 1', deeplink: '/listing/1' }, { s: 'arr' }] },
    })}'></div>`;
    const pagination = `<div wire:snapshot='${JSON.stringify({
      data: { itemIds: [[1, 2], { s: 'arr' }], itemsPerPage: 1 },
    })}'></div>`;
    const extractorMock = vi.fn().mockResolvedValueOnce(`${pagination}${listing}`).mockResolvedValueOnce(pagination);

    await expect(
      provider.config.getListings(providerConfig.inberlinwohnen.url, browser, extractorMock),
    ).rejects.toThrow('page 2 contained 0 of 1 expected listings');
  });

  offlineIt('should reject browser failures and excessive pagination', async () => {
    await expect(
      provider.config.getListings(providerConfig.inberlinwohnen.url, browser, vi.fn().mockResolvedValue(null)),
    ).rejects.toThrow('could not be loaded');

    const pagination = `
      <div wire:snapshot='${JSON.stringify({
        data: { itemIds: [Array.from({ length: 101 }, (_, index) => index), { s: 'arr' }], itemsPerPage: 1 },
      })}'></div>
      <div wire:snapshot='${JSON.stringify({
        data: { item: [{ id: 1, title: 'Listing 1', deeplink: '/listing/1' }, { s: 'arr' }] },
      })}'></div>`;
    await expect(
      provider.config.getListings(providerConfig.inberlinwohnen.url, browser, vi.fn().mockResolvedValue(pagination)),
    ).rejects.toThrow('exceeding the safety limit');
  });

  offlineIt('should accept a recognized search with no results', async () => {
    const emptySearch = `<div wire:snapshot='${JSON.stringify({
      data: { itemIds: [[], { s: 'arr' }], itemsPerPage: 10 },
    })}'></div>`;

    await expect(
      provider.config.getListings(providerConfig.inberlinwohnen.url, browser, vi.fn().mockResolvedValue(emptySearch)),
    ).resolves.toEqual([]);
  });

  offlineIt('should deduplicate listings repeated across page boundaries', async () => {
    const item = (id) =>
      `<div wire:snapshot='${JSON.stringify({ data: { item: [{ id, title: `Listing ${id}`, deeplink: `/listing/${id}` }, { s: 'arr' }] } })}'></div>`;
    const page = (ids, itemIds = null) => `<body>
      ${itemIds ? `<div wire:snapshot='${JSON.stringify({ data: { itemIds: [itemIds, { s: 'arr' }], itemsPerPage: 2 } })}'></div>` : ''}
      ${ids.map(item).join('')}
    </body>`;
    const extractorMock = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2], [1, 2, 3]))
      .mockResolvedValueOnce(page([2, 3]));

    const listings = await provider.config.getListings(providerConfig.inberlinwohnen.url, browser, extractorMock);

    expect(listings.map((listing) => JSON.parse(listing.id).data.item[0].id)).toEqual([1, 2, 3]);
  });

  offlineIt.each([
    ['berlinovo.de', '<div class="field--name-field-description">Helle Wohnung mit Einbauküche und Balkon.</div>'],
    [
      'www.degewo.de',
      '<section id="section-description"><div class="c-copy">Ruhige Wohnung im obersten Geschoss.</div></section>',
    ],
    [
      'www.gesobau.de',
      '<div class="immoContent"><div class="immoMainContent"><p>Wohnung mit Serviceangeboten für Seniorinnen und Senioren.</p></div></div>',
    ],
    [
      'www.gewobag.de',
      '<div class="details-description"><h2 id="objektbeschreibung"></h2><p>Neubauwohnung mit Balkon und Fußbodenheizung.</p></div>',
    ],
    [
      'www.howoge.de',
      '<main><div class="section"><strong>Beschreibung</strong><p class="readmore__wrap">Drei Zimmer mit Balkon und modernem Bad.</p></div></main>',
    ],
    ['www.wbm.de', '<div class="openimmo-detail__intro-text">Gut geschnittene Wohnung mit hellen Wohnräumen.</div>'],
  ])('should enrich detail descriptions from %s', async (hostname, html) => {
    const extractorMock = vi.fn().mockResolvedValue(html);
    const listing = {
      id: 'listing-1',
      link: `https://${hostname}/listing/1`,
      description: 'Gesamtmiete: 600 €',
    };

    const enriched = await provider.config.fetchDetails(listing, browser, extractorMock);

    expect(enriched.description).toContain('Gesamtmiete: 600 €');
    expect(enriched.description).not.toBe(listing.description);
    expect(extractorMock).toHaveBeenCalledWith(listing.link, null, expect.objectContaining({ browser }));
  });

  offlineIt('should preserve listings when detail enrichment is unsupported or unavailable', async () => {
    const unsupported = { id: '1', link: 'https://example.com/listing/1', description: 'Original' };
    expect(await provider.config.fetchDetails(unsupported, browser)).toBe(unsupported);

    const supported = { ...unsupported, link: 'https://www.degewo.de/listing/1' };
    const extractorMock = vi.fn().mockResolvedValue(null);
    expect(await provider.config.fetchDetails(supported, browser, extractorMock)).toBe(supported);

    const stadtUndLand = { ...unsupported, link: 'https://stadtundland.de/wohnungssuche/1' };
    expect(await provider.config.fetchDetails(stadtUndLand, browser, extractorMock)).toBe(stadtUndLand);
  });

  it('should support object snapshots and rent fallbacks', () => {
    const baseItem = {
      id: 19252,
      title: 'Fallback listing',
      deeplink: '/wohnungsfinder/fallback',
      rooms: '2,0',
      area: '51,04',
    };

    const objectListing = provider.config.normalize(snapshot({ ...baseItem, rentGross: '503,91' }, false));
    const netRentListing = provider.config.normalize(snapshot({ ...baseItem, rentNet: '428,38' }));

    expect(objectListing.price).toBe(503.91);
    expect(objectListing.link).toBe('https://inberlinwohnen.de/wohnungsfinder/fallback');
    expect(netRentListing.price).toBe(428.38);
    expect(netRentListing.id).toBe(objectListing.id);
    expect(provider.config.normalize(snapshot({ ...baseItem, deeplink: 'http://%' })).link).toBeNull();
    expect(provider.config.normalize(snapshot({ ...baseItem, deeplink: 'javascript:alert(1)' })).link).toBeNull();

    const stablePartnerId = provider.config.normalize(snapshot({ ...baseItem, id: 100, objectId: 'partner-42' }));
    expect(stablePartnerId.id).toBe(buildHash('partner-42'));
  });

  it('should apply blacklist terms to titles and descriptions', () => {
    provider.init(providerConfig.inberlinwohnen, ['wbs']);

    expect(provider.config.filter({ title: 'Wohnung mit WBS', description: '' })).toBe(false);
    expect(provider.config.filter({ title: 'Wohnung', description: 'WBS erforderlich' })).toBe(false);
    expect(provider.config.filter({ title: 'Wohnung', description: 'Bezugsfertig' })).toBe(true);

    provider.init(providerConfig.inberlinwohnen, []);
  });

  it('should follow safe redirects when checking if a listing is active', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 302, headers: new Headers({ location: '/properties/new.html' }) })
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ status: 410 })
      .mockResolvedValueOnce({ status: 503 })
      .mockRejectedValueOnce(new Error('network failure'));
    globalThis.fetch = fetchMock;

    try {
      await expect(provider.config.activeTester('https://www.degewo.de/redirect')).resolves.toBe(1);
      await expect(provider.config.activeTester('https://www.degewo.de/gone')).resolves.toBe(0);
      await expect(provider.config.activeTester('https://www.degewo.de/removed')).resolves.toBe(0);
      await expect(provider.config.activeTester('https://www.degewo.de/unavailable')).resolves.toBe(-1);
      await expect(provider.config.activeTester('https://www.degewo.de/network-error')).resolves.toBe(-1);
      await expect(provider.config.activeTester('http://127.0.0.1/private')).resolves.toBe(-1);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://www.degewo.de/redirect',
        expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://www.degewo.de/properties/new.html',
        expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) }),
      );
      expect(fetchMock).toHaveBeenCalledTimes(6);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
