/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  userCanAccessListing: vi.fn(() => true),
  getListingById: vi.fn(() => ({ id: 'listing-1', job_id: 'job-1', address: 'old address' })),
  setListingAddress: vi.fn(() => 1),
  queryListings: vi.fn(),
  getListingsForMap: vi.fn(),
  getPriceHistory: vi.fn(),
  setListingNotes: vi.fn(),
  setListingStatus: vi.fn(),
  deleteListingsByJobId: vi.fn(),
  deleteListingsById: vi.fn(),
}));
vi.mock('../../lib/services/storage/watchListStorage.js', () => ({ toggleWatch: vi.fn(), ensureWatch: vi.fn() }));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  getJob: vi.fn(() => ({ id: 'job-1', userId: 'owner-1' })),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ demoMode: false })),
  getUserSettings: vi.fn(() => ({})),
}));
vi.mock('../../lib/services/geocoding/distanceService.js', () => ({ updateDistancesForListing: vi.fn() }));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));

import * as listingStorage from '../../lib/services/storage/listingsStorage.js';
import { getJob } from '../../lib/services/storage/jobStorage.js';
import { getSettings } from '../../lib/services/storage/settingsStorage.js';
import { updateDistancesForListing } from '../../lib/services/geocoding/distanceService.js';
import { isAdmin } from '../../lib/api/security.js';
import listingsPlugin from '../../lib/api/routes/listingsRouter.js';

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.session = { currentUser: 'user-1' };
    request.currentUser = { id: 'user-1' };
  });
  await app.register(listingsPlugin);
  await app.ready();
  return app;
}

const VALID_BODY = { address: 'Mindener Straße 90, 40227 Düsseldorf', latitude: 51.2109, longitude: 6.8074 };

const post = async (body) => {
  const app = await buildApp();
  return app.inject({ method: 'POST', url: '/listing-1/address', payload: body });
};

beforeEach(() => {
  vi.clearAllMocks();
  listingStorage.userCanAccessListing.mockReturnValue(true);
  listingStorage.getListingById.mockReturnValue({ id: 'listing-1', job_id: 'job-1', address: 'old address' });
  listingStorage.setListingAddress.mockReturnValue(1);
  getJob.mockReturnValue({ id: 'job-1', userId: 'owner-1' });
  getSettings.mockResolvedValue({ demoMode: false });
  isAdmin.mockReturnValue(false);
});

describe('POST /:listingId/address', () => {
  it('stores the address and the coordinates', async () => {
    const response = await post(VALID_BODY);

    expect(response.statusCode).toBe(200);
    expect(listingStorage.setListingAddress).toHaveBeenCalledWith(
      'listing-1',
      'Mindener Straße 90, 40227 Düsseldorf',
      51.2109,
      6.8074,
    );
  });

  it('trims the address before storing it', async () => {
    await post({ ...VALID_BODY, address: '   Wehrhahn 1, 40211 Düsseldorf   ' });

    expect(listingStorage.setListingAddress).toHaveBeenCalledWith(
      'listing-1',
      'Wehrhahn 1, 40211 Düsseldorf',
      51.2109,
      6.8074,
    );
  });

  it('answers with the refreshed listing so the caller need not fetch it again', async () => {
    listingStorage.getListingById.mockReturnValueOnce({ id: 'listing-1', job_id: 'job-1', address: 'old address' });
    listingStorage.getListingById.mockReturnValueOnce({
      id: 'listing-1',
      job_id: 'job-1',
      address: VALID_BODY.address,
      address_is_manual: 1,
    });

    const response = await post(VALID_BODY);

    expect(response.json()).toMatchObject({ address: VALID_BODY.address, address_is_manual: 1 });
  });

  // Jobs can be shared. The distances belong to the person whose search this is, not to whoever
  // happens to be looking at the listing.
  it('recomputes the distances against the job owner, not the caller', async () => {
    await post(VALID_BODY);

    expect(updateDistancesForListing).toHaveBeenCalledWith('listing-1', 51.2109, 6.8074, 'owner-1');
  });

  it('still saves when the job has vanished, without recomputing distances', async () => {
    getJob.mockReturnValue(null);

    const response = await post(VALID_BODY);

    expect(response.statusCode).toBe(200);
    expect(updateDistancesForListing).not.toHaveBeenCalled();
  });

  describe('validation', () => {
    it('rejects a blank address', async () => {
      for (const address of ['', '   ', null, 42]) {
        const response = await post({ ...VALID_BODY, address });
        expect(response.statusCode).toBe(400);
      }
      expect(listingStorage.setListingAddress).not.toHaveBeenCalled();
    });

    it('rejects an address longer than the column is meant to carry', async () => {
      const response = await post({ ...VALID_BODY, address: 'a'.repeat(513) });

      expect(response.statusCode).toBe(400);
      expect(listingStorage.setListingAddress).not.toHaveBeenCalled();
    });

    it('rejects coordinates that are missing or out of range', async () => {
      const cases = [
        { latitude: undefined, longitude: 6.8 },
        { latitude: 51.2, longitude: undefined },
        { latitude: 'north', longitude: 6.8 },
        { latitude: 91, longitude: 6.8 },
        { latitude: 51.2, longitude: 181 },
      ];
      for (const coords of cases) {
        const response = await post({ ...VALID_BODY, ...coords });
        expect(response.statusCode).toBe(400);
      }
      expect(listingStorage.setListingAddress).not.toHaveBeenCalled();
    });

    // The geocoder's "looked, found nothing" marker. Stored as a position it would put the listing
    // in the Atlantic.
    it('rejects the -1/-1 not-found marker', async () => {
      const response = await post({ ...VALID_BODY, latitude: -1, longitude: -1 });

      expect(response.statusCode).toBe(400);
      expect(listingStorage.setListingAddress).not.toHaveBeenCalled();
    });
  });

  describe('access', () => {
    it('refuses a listing the user cannot see', async () => {
      listingStorage.userCanAccessListing.mockReturnValue(false);

      const response = await post(VALID_BODY);

      expect(response.statusCode).toBe(403);
      expect(listingStorage.setListingAddress).not.toHaveBeenCalled();
    });

    it('refuses in demo mode unless the user is an admin', async () => {
      getSettings.mockResolvedValue({ demoMode: true });

      const denied = await post(VALID_BODY);
      expect(denied.statusCode).toBe(403);
      expect(listingStorage.setListingAddress).not.toHaveBeenCalled();

      isAdmin.mockReturnValue(true);
      const allowed = await post(VALID_BODY);
      expect(allowed.statusCode).toBe(200);
    });
  });

  describe('failures', () => {
    it('reports a listing that disappeared as 404', async () => {
      listingStorage.getListingById.mockReturnValue(null);

      const response = await post(VALID_BODY);

      expect(response.statusCode).toBe(404);
    });

    it('reports an update that changed nothing as 404', async () => {
      listingStorage.setListingAddress.mockReturnValue(0);

      const response = await post(VALID_BODY);

      expect(response.statusCode).toBe(404);
      expect(updateDistancesForListing).not.toHaveBeenCalled();
    });

    it('turns a storage failure into a 500', async () => {
      listingStorage.setListingAddress.mockImplementation(() => {
        throw new Error('database on fire');
      });

      const response = await post(VALID_BODY);

      expect(response.statusCode).toBe(500);
    });
  });
});
