/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

/**
 * On-demand detail enrichment ("enrich on click").
 *
 * Scrape-time stays sparse - one undetectable list call per provider - and the per-exposé
 * request only happens when a human opens the listing. The route answers with a status rather
 * than an error, mirroring the geocode retry: `ready` carries the enriched listing,
 * `unavailable` keeps the sparse one and may be retried, `unsupported` means the provider
 * offers no detail fetch and the flag is set so the UI stops offering a retry.
 *
 * Browser providers share one persistent enrichment browser (a warmed session with surviving
 * cookies, not a zero-history browser per click); a DataDome-refused provider cools down
 * instead of burning another warmup on a known verdict.
 */
const root = (await import('node:path')).resolve('.');
const listingStoragePath = root + '/lib/services/storage/listingsStorage.js';
const utilsPath = root + '/lib/utils.js';
const jobStoragePath = root + '/lib/services/storage/jobStorage.js';
const settingsStoragePath = root + '/lib/services/storage/settingsStorage.js';
const listingImagesPath = root + '/lib/services/listings/listingImages.js';
const enrichmentBrowserPath = root + '/lib/services/listings/enrichmentBrowser.js';
const immoweltBffPath = root + '/lib/services/immowelt/immoweltBff.js';
const trackerPath = root + '/lib/services/tracking/Tracker.js';

let listing;
let job;
let canAccess;
let demoMode;
let proxyUrl;
let providerId;
let fetchDetailsFn;
let createConfigFn;
let fetchCalls;
let downloaded;
let storedDetails;
let browserUses;
let browserLaunches;
let browserStalls;
let cooledDown;
let releasedSessions;
let sessionRefused;
let coolingDown;
let imageFile;

const sparseDescription = 'Short desc';

/**
 * @param {{demoMode?: boolean, isAdmin?: boolean}} [options]
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function buildServer({ demoMode: demo = false, isAdmin = false } = {}) {
  vi.resetModules();
  fetchCalls = [];
  downloaded = [];
  storedDetails = [];
  browserUses = [];
  browserLaunches = 0;
  cooledDown = [];
  cooledDown = [];
  releasedSessions = [];
  demoMode = demo;

  vi.doMock(listingStoragePath, () => ({
    userCanAccessListing: () => canAccess,
    getListingById: () => listing,
    setListingDetails: (id, details) => {
      storedDetails.push({ id, details });
      if (listing && listing.id === id) {
        if (details.description != null) listing.description = details.description;
        if (details.size != null) listing.size = details.size;
        if (details.rooms != null) listing.rooms = details.rooms;
        if (details.buildYear != null) listing.build_year = details.buildYear;
        if (details.energyClass != null) listing.energy_class = details.energyClass;
        if (details.imageFiles != null) listing.image_files = details.imageFiles;
        listing.details_fetched = 1;
        listing.details_fetched_at = Date.now();
      }
      return 1;
    },
  }));
  vi.doMock(utilsPath, () => ({
    nullOrEmpty: (value) => value == null || String(value).trim().length === 0,
    getProviders: async () => {
      // Wrapped to count calls, keeping the arity: the route launches a browser exactly when
      // the detail fetch takes one (immoscout takes the listing only, the others take a browser).
      const single = async (sparse) => {
        fetchCalls.push([sparse]);
        return fetchDetailsFn(sparse);
      };
      const withBrowser = async (sparse, browser) => {
        fetchCalls.push([sparse, browser]);
        return fetchDetailsFn(sparse, browser);
      };
      const wrapped = (fetchDetailsFn?.length ?? 0) > 1 ? withBrowser : single;
      return [
        {
          metaInformation: { id: providerId },
          config: { fetchDetails: fetchDetailsFn == null ? fetchDetailsFn : wrapped },
          createConfig: createConfigFn ?? ((source) => ({ ...source, filter: () => true, fetchDetails: wrapped })),
        },
      ];
    },
  }));
  vi.doMock(jobStoragePath, () => ({ getJob: () => job }));
  vi.doMock(settingsStoragePath, () => ({
    getSettings: async () => ({ demoMode, proxyUrl }),
    getUserSettings: () => ({}),
  }));
  vi.doMock(listingImagesPath, () => ({
    downloadListingImages: async (id, urls) => {
      downloaded.push({ id, urls });
      return urls.map((_, index) => `${id}/${String(index).padStart(2, '0')}.jpg`);
    },
    readListingImage: async () => imageFile,
  }));
  vi.doMock(enrichmentBrowserPath, () => ({
    withEnrichmentBrowser: async (fn, url) => {
      browserUses.push({ url });
      browserLaunches += 1;
      if (browserStalls) {
        throw new Error('Enrichment browser spawn timed out after 30000 ms');
      }
      return fn({ fake: 'shared-browser' });
    },
    isProviderCoolingDown: () => coolingDown,
    coolDownProvider: (id) => {
      cooledDown.push(id);
    },
  }));
  vi.doMock(immoweltBffPath, () => ({
    isSessionRefused: () => sessionRefused,
    releaseSession: async (browser) => {
      releasedSessions.push(browser);
    },
  }));
  vi.doMock(trackerPath, () => ({ trackPoi: async () => {} }));

  const plugin = (await import(root + '/lib/api/routes/listingsRouter.js')).default;
  const app = Fastify();
  app.addHook('preHandler', (request, _reply, done) => {
    request.session = { currentUser: 'user-1' };
    request.currentUser = { id: 'user-1', isAdmin };
    done();
  });
  await app.register(plugin, { prefix: '/api/listings' });
  return app;
}

const enrich = (app) => app.inject({ method: 'POST', url: '/api/listings/listing-1/details', payload: {} });

beforeEach(() => {
  listing = {
    id: 'listing-1',
    hash: 'hash-1',
    link: 'https://www.immobilienscout24.de/expose/123',
    title: 'Nice flat',
    price: 1000,
    size: 70,
    rooms: 2,
    address: 'Office Street 1, Berlin',
    description: sparseDescription,
    image_url: 'https://cover.jpg',
    build_year: null,
    energy_class: null,
    provider: 'immoscout',
    job_id: 'job-1',
    details_fetched: 0,
    details_fetched_at: null,
    image_files: null,
  };
  job = {
    id: 'job-1',
    userId: 'owner-1',
    provider: [{ id: 'immoscout', url: 'https://www.immobilienscout24.de/search', enabled: true }],
    blacklist: [],
  };
  canAccess = true;
  demoMode = false;
  proxyUrl = '';
  providerId = 'immoscout';
  sessionRefused = false;
  coolingDown = false;
  browserStalls = false;
  imageFile = null;
  // Imitates immoscout's pushDetails: same object back, description replaced, gallery attached.
  fetchDetailsFn = async (sparse) => ({
    ...sparse,
    description: 'Full exposé description',
    images: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
  });
  createConfigFn = null;
});

describe('POST /api/listings/:listingId/details', () => {
  it('enriches with the full description and gallery, then answers ready', async () => {
    const app = await buildServer();
    const response = await enrich(app);

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ready');
    // One detail fetch, no browser: immoscout's exposé is a plain API call.
    expect(fetchCalls.length).toBe(1);
    expect(browserUses).toEqual([]);
    expect(downloaded).toEqual([{ id: 'listing-1', urls: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'] }]);
    expect(storedDetails).toEqual([
      {
        id: 'listing-1',
        details: {
          description: 'Full exposé description',
          size: 70,
          rooms: 2,
          buildYear: null,
          energyClass: null,
          imageFiles: ['listing-1/00.jpg', 'listing-1/01.jpg'],
        },
      },
    ]);
    // The refreshed listing rides back so the detail view redraws without a second round trip.
    expect(response.json().listing.description).toBe('Full exposé description');
    expect(response.json().listing.image_files).toEqual(['listing-1/00.jpg', 'listing-1/01.jpg']);
    await app.close();
  });

  it('is idempotent: a fetched listing answers ready without another outbound request', async () => {
    listing.details_fetched = 1;
    listing.description = 'Full exposé description';
    listing.image_files = ['listing-1/00.jpg'];
    fetchDetailsFn = async () => {
      throw new Error('must not be called');
    };
    const app = await buildServer();

    const response = await enrich(app);

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ready');
    expect(fetchCalls).toEqual([]);
    expect(downloaded).toEqual([]);
    expect(storedDetails).toEqual([]);
    await app.close();
  });

  it('keeps the sparse listing when the exposé answers nothing new', async () => {
    fetchDetailsFn = async (sparse) => ({ ...sparse, images: [] });
    const app = await buildServer();

    const response = await enrich(app);

    expect(response.json().status).toBe('unavailable');
    // No flag set: a transient failure stays retryable, the sparse listing is kept.
    expect(storedDetails).toEqual([]);
    expect(response.json().listing.description).toBe(sparseDescription);
    await app.close();
  });

  it('marks unsupported providers so the UI stops offering a retry', async () => {
    fetchDetailsFn = undefined;
    createConfigFn = () => ({});
    const app = await buildServer();

    const response = await enrich(app);

    expect(response.json().status).toBe('unsupported');
    expect(storedDetails).toEqual([{ id: 'listing-1', details: {} }]);
    await app.close();
  });

  it('uses the shared enrichment browser for providers that need one, and keeps it open', async () => {
    // Two parameters: only then does the route take the browser path. The wrapper records the call.
    // eslint-disable-next-line no-unused-vars
    fetchDetailsFn = async (sparse, browser) => ({ ...sparse, description: 'Full exposé description', images: [] });
    const app = await buildServer();

    const response = await enrich(app);

    expect(response.json().status).toBe('ready');
    // One warmed session, reused: the browser outlives the call so its cookies survive.
    expect(browserUses).toEqual([{ url: listing.link }]);
    expect(browserLaunches).toBe(1);
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0][1]).toEqual({ fake: 'shared-browser' });
    await app.close();
  });

  it('keeps the sparse listing when the exposé fetch throws, without closing the shared browser', async () => {
    // Two parameters: the route takes a browser exactly when the fetch takes one.
    // eslint-disable-next-line no-unused-vars
    fetchDetailsFn = async (_sparse, _browser) => {
      throw new Error('portal said no');
    };
    const app = await buildServer();

    const response = await enrich(app);

    expect(response.json().status).toBe('unavailable');
    expect(storedDetails).toEqual([]);
    await app.close();
  });

  it('answers a stalled spawn as unavailable instead of hanging the request', async () => {
    browserStalls = true;
    // Two parameters: only the browser path reaches the (stalled) shared browser.
    // eslint-disable-next-line no-unused-vars
    fetchDetailsFn = async (sparse, browser) => ({ ...sparse, description: 'Full exposé description', images: [] });
    const app = await buildServer();

    const response = await enrich(app);

    expect(response.json().status).toBe('unavailable');
    expect(fetchCalls).toEqual([]);
    // No flag set: the next click tries again instead of awaiting a stuck launch.
    expect(storedDetails).toEqual([]);
    await app.close();
  });

  it('skips a cooling-down provider without spending another warmup', async () => {
    coolingDown = true;
    // eslint-disable-next-line no-unused-vars
    fetchDetailsFn = async (sparse, browser) => ({ ...sparse, description: 'Full exposé description', images: [] });
    const app = await buildServer();

    const response = await enrich(app);

    expect(response.json().status).toBe('unavailable');
    expect(fetchCalls).toEqual([]);
    expect(browserUses).toEqual([]);
    expect(storedDetails).toEqual([]);
    await app.close();
  });

  it('cools a refused immowelt session down and drops the page, keeping the browser', async () => {
    providerId = 'immowelt';
    listing.provider = 'immowelt';
    sessionRefused = true;
    // eslint-disable-next-line no-unused-vars
    fetchDetailsFn = async (sparse, browser) => ({ ...sparse, description: 'Full exposé description', images: [] });
    const app = await buildServer();

    const response = await enrich(app);

    expect(response.json().status).toBe('ready');
    expect(releasedSessions).toEqual([{ fake: 'shared-browser' }]);
    expect(cooledDown).toEqual(['immowelt']);
    await app.close();
  });

  it('answers 403 for a listing belonging to someone else', async () => {
    canAccess = false;
    const app = await buildServer();

    expect((await enrich(app)).statusCode).toBe(403);
    await app.close();
  });

  it('is refused in demo mode', async () => {
    const app = await buildServer({ demoMode: true });

    expect((await enrich(app)).statusCode).toBe(403);
    expect(storedDetails).toEqual([]);
    await app.close();
  });

  it('answers 404 for a listing that is not there', async () => {
    listing = null;
    const app = await buildServer();

    expect((await enrich(app)).statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /api/listings/:listingId/images/:index', () => {
  it('serves a stored gallery file with its content type', async () => {
    listing.details_fetched = 1;
    listing.image_files = ['listing-1/00.jpg'];
    imageFile = { buffer: Buffer.from([0xff, 0xd8]), contentType: 'image/jpeg' };
    const app = await buildServer();

    const response = await app.inject({ method: 'GET', url: '/api/listings/listing-1/images/0' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    await app.close();
  });

  it('answers 404 for an index outside the gallery', async () => {
    listing.details_fetched = 1;
    listing.image_files = ['listing-1/00.jpg'];
    imageFile = { buffer: Buffer.from([1]), contentType: 'image/jpeg' };
    const app = await buildServer();

    expect((await app.inject({ method: 'GET', url: '/api/listings/listing-1/images/5' })).statusCode).toBe(404);
    await app.close();
  });

  it('answers 404 when the file is gone from disk', async () => {
    listing.details_fetched = 1;
    listing.image_files = ['listing-1/00.jpg'];
    imageFile = null;
    const app = await buildServer();

    expect((await app.inject({ method: 'GET', url: '/api/listings/listing-1/images/0' })).statusCode).toBe(404);
    await app.close();
  });

  it('answers 403 for a listing belonging to someone else', async () => {
    canAccess = false;
    const app = await buildServer();

    expect((await app.inject({ method: 'GET', url: '/api/listings/listing-1/images/0' })).statusCode).toBe(403);
    await app.close();
  });
});
