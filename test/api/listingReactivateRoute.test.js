/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  userCanAccessListing: vi.fn(() => true),
  filterListingIdsForUser: vi.fn((ids) => ids),
  reactivateListings: vi.fn(),
  restoreListingsById: vi.fn(),
  getListingById: vi.fn(),
  setListingAddress: vi.fn(),
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
  getJob: vi.fn(() => ({ id: 'job-1', userId: 'user-1' })),
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
import { getSettings } from '../../lib/services/storage/settingsStorage.js';
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

const post = async (payload) => {
  const app = await buildApp();
  return app.inject({ method: 'POST', url: '/reactivate', payload });
};

beforeEach(() => {
  vi.clearAllMocks();
  listingStorage.filterListingIdsForUser.mockImplementation((ids) => ids);
  getSettings.mockResolvedValue({ demoMode: false });
  isAdmin.mockReturnValue(false);
});

/**
 * The route hands the alive-checker's verdict back to the user, so the interesting cases are the
 * guards around it rather than the write itself: whose listings may be touched, and where the
 * instance forbids writes outright.
 */
describe('POST /api/listings/reactivate', () => {
  it('reactivates the listings the user owns', async () => {
    const response = await post({ ids: ['mine-1', 'mine-2'] });

    expect(response.statusCode).toBe(200);
    expect(listingStorage.reactivateListings).toHaveBeenCalledWith(['mine-1', 'mine-2']);
  });

  it('rejects a batch containing a listing the user cannot access', async () => {
    listingStorage.filterListingIdsForUser.mockReturnValue(['mine-1']);

    const response = await post({ ids: ['mine-1', 'someone-elses'] });

    // All-or-nothing, same as /restore and the delete routes: a request naming one foreign listing
    // is refused outright rather than half-applied.
    expect(response.statusCode).toBe(403);
    expect(listingStorage.reactivateListings).not.toHaveBeenCalled();
  });

  it('refuses in demo mode', async () => {
    getSettings.mockResolvedValue({ demoMode: true });

    const response = await post({ ids: ['mine-1'] });

    expect(response.statusCode).toBe(403);
    expect(listingStorage.reactivateListings).not.toHaveBeenCalled();
  });

  it('lets an admin through in demo mode', async () => {
    getSettings.mockResolvedValue({ demoMode: true });
    isAdmin.mockReturnValue(true);

    const response = await post({ ids: ['mine-1'] });

    expect(response.statusCode).toBe(200);
    expect(listingStorage.reactivateListings).toHaveBeenCalledWith(['mine-1']);
  });

  it('does nothing on an empty or missing id list', async () => {
    expect((await post({ ids: [] })).statusCode).toBe(200);
    expect((await post({})).statusCode).toBe(200);
    expect(listingStorage.reactivateListings).not.toHaveBeenCalled();
  });

  it('answers 500 when the write throws', async () => {
    listingStorage.reactivateListings.mockImplementation(() => {
      throw new Error('database is locked');
    });

    const response = await post({ ids: ['mine-1'] });

    expect(response.statusCode).toBe(500);
    expect(response.json().error).toBe('database is locked');
  });
});
