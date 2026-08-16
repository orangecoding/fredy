/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

/**
 * Retrying one listing's geocode by hand.
 *
 * Issue #418: the lookup at scrape time is best effort, so a rate limit leaves a listing showing its
 * address and nothing on the map, and the only remedy was the six-hourly sweep or the accident of
 * pressing Save in Settings. Every answer here has to be distinguishable, because "we could not
 * reach the geocoder" and "there is no such place" ask opposite things of the user.
 */
const root = (await import('node:path')).resolve('.');
const listingStoragePath = root + '/lib/services/storage/listingsStorage.js';
const geoCodingPath = root + '/lib/services/geocoding/geoCodingService.js';
const distanceServicePath = root + '/lib/services/geocoding/distanceService.js';
const jobStoragePath = root + '/lib/services/storage/jobStorage.js';
const settingsStoragePath = root + '/lib/services/storage/settingsStorage.js';
const trackerPath = root + '/lib/services/tracking/Tracker.js';

let listing;
let geocodeResult;
let paused;
let stored;
let distanceUpdates;

/**
 * @param {{demoMode?: boolean, isAdmin?: boolean}} [options]
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function buildServer({ demoMode = false, isAdmin = false } = {}) {
  vi.resetModules();
  stored = [];
  distanceUpdates = [];

  vi.doMock(listingStoragePath, () => ({
    userCanAccessListing: () => true,
    getListingById: () => listing,
    updateListingGeocoordinates: (id, latitude, longitude) => stored.push({ id, latitude, longitude }),
  }));
  vi.doMock(geoCodingPath, () => ({
    geocodeAddress: async () => geocodeResult,
    isGeocodingPaused: () => paused,
  }));
  vi.doMock(distanceServicePath, () => ({
    updateDistancesForListing: (...args) => distanceUpdates.push(args),
  }));
  vi.doMock(jobStoragePath, () => ({ getJob: () => ({ userId: 'owner-1' }) }));
  vi.doMock(settingsStoragePath, () => ({
    getSettings: async () => ({ demoMode }),
    getUserSettings: () => ({}),
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

const retry = (app) => app.inject({ method: 'POST', url: '/api/listings/listing-1/geocode', payload: {} });

beforeEach(() => {
  listing = { id: 'listing-1', address: 'Office Street 1, Berlin', job_id: 'job-1', address_is_manual: 0 };
  geocodeResult = { lat: 52.52, lng: 13.4 };
  paused = false;
});

describe('POST /api/listings/:listingId/geocode', () => {
  it('stores the coordinates it finds and hands the listing back', async () => {
    const app = await buildServer();
    const response = await retry(app);

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('found');
    expect(stored).toEqual([{ id: 'listing-1', latitude: 52.52, longitude: 13.4 }]);
    // Distances belong to whoever owns the job, not to whoever is looking, because jobs are shared.
    expect(distanceUpdates[0]).toEqual(['listing-1', 52.52, 13.4, 'owner-1']);
    await app.close();
  });

  /**
   * The distinction the whole endpoint exists for. A stood-off geocoder must never be reported as an
   * address that does not exist, or the user goes off correcting an address that was fine.
   */
  it('says the service is unavailable rather than blaming the address', async () => {
    paused = true;
    const app = await buildServer();

    expect((await retry(app)).json().status).toBe('unavailable');
    expect(stored).toEqual([]);
    await app.close();
  });

  it('says the same when the lookup itself comes back empty-handed', async () => {
    geocodeResult = null;
    const app = await buildServer();

    expect((await retry(app)).json().status).toBe('unavailable');
    expect(stored).toEqual([]);
    await app.close();
  });

  /** -1/-1 is the geocoder having looked and found nothing. That is about the address. */
  it('reports a genuine not-found separately, and stores nothing', async () => {
    geocodeResult = { lat: -1, lng: -1 };
    const app = await buildServer();

    expect((await retry(app)).json().status).toBe('notFound');
    expect(stored).toEqual([]);
    await app.close();
  });

  it('leaves an address the user placed by hand alone', async () => {
    listing.address_is_manual = 1;
    const app = await buildServer();

    expect((await retry(app)).json().status).toBe('manual');
    expect(stored).toEqual([]);
    await app.close();
  });

  it('has nothing to look up without an address', async () => {
    listing.address = null;
    const app = await buildServer();

    expect((await retry(app)).json().status).toBe('noAddress');
    await app.close();
  });

  it('is refused in demo mode', async () => {
    const app = await buildServer({ demoMode: true });

    expect((await retry(app)).statusCode).toBe(403);
    expect(stored).toEqual([]);
    await app.close();
  });

  it('answers 404 for a listing that is not there', async () => {
    listing = null;
    const app = await buildServer();

    expect((await retry(app)).statusCode).toBe(404);
    await app.close();
  });
});
