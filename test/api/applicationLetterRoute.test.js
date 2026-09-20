/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');

/** @type {Array<{id: string, userId: string, isAdmin: boolean, options: any}>} */
let listingLookups;
/** @type {string[]} */
let tracked;

const listing = {
  id: 'abc',
  provider: 'casa',
  dealType: 'rent',
  title: 'Trilocale luminoso',
  address: 'Via Roma 1, Milano',
  price: 1200,
  link: 'https://example.com/1',
};

/**
 * Register the listings plugin against a fastify double and return the application-letter handler.
 *
 * @param {Object} [options]
 * @param {Object|null} [options.found] What `getListingById` answers with.
 * @returns {Promise<(request: any, reply: any) => Promise<any>>}
 */
async function loadHandler({ found = listing } = {}) {
  listingLookups = [];
  tracked = [];
  vi.resetModules();

  vi.doMock(root + '/lib/services/storage/listingsStorage.js', () => ({
    getListingById: (id, userId, isAdmin, options) => {
      listingLookups.push({ id, userId, isAdmin, options });
      return found;
    },
  }));
  vi.doMock(root + '/lib/services/storage/watchListStorage.js', () => ({}));
  vi.doMock(root + '/lib/api/security.js', () => ({ isAdmin: () => false }));
  vi.doMock(root + '/lib/services/storage/jobStorage.js', () => ({ getJob: () => null }));
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => ({}),
    getUserSettings: () => ({ language: 'de' }),
  }));
  vi.doMock(root + '/lib/services/tracking/Tracker.js', () => ({ trackPoi: async (poi) => tracked.push(poi) }));
  vi.doMock(root + '/lib/services/geocoding/distanceService.js', () => ({ updateDistancesForListing: vi.fn() }));
  vi.doMock(root + '/lib/services/geocoding/geoCodingService.js', () => ({
    geocodeAddress: vi.fn(),
    isGeocodingPaused: () => false,
  }));
  vi.doMock(root + '/lib/services/providers/providerCountries.js', () => ({
    getCountriesForListing: async () => ['it'],
  }));
  vi.doMock(root + '/lib/utils.js', () => ({
    getProviders: async () => [{ metaInformation: { id: 'casa', name: 'Casa.it' } }],
    nullOrEmpty: (value) => value == null || value === '',
  }));

  const plugin = (await import(root + '/lib/api/routes/listingsRouter.js')).default;
  /** @type {Record<string, any>} */
  const routes = {};
  await plugin({
    get: (path, handler) => (routes[`GET ${path}`] = handler),
    post: () => {},
    delete: () => {},
    put: () => {},
  });
  return routes['GET /:listingId/application'];
}

/** A reply double that records what the handler answered. */
function replyDouble() {
  const recorded = { status: 200, payload: undefined };
  return {
    recorded,
    code(status) {
      recorded.status = status;
      return this;
    },
    send(payload) {
      recorded.payload = payload;
      return recorded;
    },
  };
}

const request = (query = {}) => ({ params: { listingId: 'abc' }, query, session: { currentUser: 'user-1' } });

describe('GET /api/listings/:listingId/application', () => {
  /** @type {(request: any, reply: any) => Promise<any>} */
  let handler;

  beforeEach(async () => {
    handler = await loadHandler();
  });

  it('is registered', () => {
    expect(typeof handler).toBe('function');
  });

  it('answers with a letter in the language of the portal', async () => {
    const result = await handler(request(), replyDouble());
    expect(result.language).toBe('it');
    expect(result.text).toContain('Trilocale luminoso');
    expect(result.dealType).toBe('rent');
  });

  it('reports what the profile is still missing', async () => {
    const result = await handler(request(), replyDouble());
    expect(result.hasProfile).toBe(false);
    expect(result.missing).toContain('applicant.fullName');
  });

  it('honours an explicit language in the query string', async () => {
    const result = await handler(request({ language: 'en' }), replyDouble());
    expect(result.language).toBe('en');
  });

  it('does not pay for the route geometry it has no use for', async () => {
    await handler(request(), replyDouble());
    expect(listingLookups[0].options).toEqual({ includeGeometry: false });
  });

  it('scopes the lookup to the calling user', async () => {
    await handler(request(), replyDouble());
    expect(listingLookups[0].id).toBe('abc');
    expect(listingLookups[0].userId).toBe('user-1');
  });

  it("answers 404 for a listing that is gone or is somebody else's", async () => {
    const missing = await loadHandler({ found: null });
    const reply = replyDouble();
    await missing(request(), reply);
    expect(reply.recorded.status).toBe(404);
  });

  it('answers 400 without a session', async () => {
    const reply = replyDouble();
    await handler({ params: { listingId: 'abc' }, query: {}, session: {} }, reply);
    expect(reply.recorded.status).toBe(400);
  });

  it('records that a letter was drafted', async () => {
    await handler(request(), replyDouble());
    expect(tracked).toContain('APPLICATION_LETTER_DRAFTED');
  });
});
