/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Everything the listings route pulls in is mocked, so this suite exercises the bulk delete's
// guards and its request normalisation and nothing else. What the resulting filter then matches in
// the database is test/services/storage/listingsStorage.deleteByFilter.test.js.
vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getAvailableProviders: vi.fn(() => []),
  getListingsForMap: vi.fn(() => []),
  getListingById: vi.fn(() => null),
  setListingNotes: vi.fn(() => 1),
  setListingStatus: vi.fn(() => 1),
  deleteListingsByJobId: vi.fn(),
  deleteListingsById: vi.fn(),
  deleteListingsByFilter: vi.fn(() => ({ changes: 7 })),
  restoreListingsById: vi.fn(),
}));
vi.mock('../../lib/services/storage/watchListStorage.js', () => ({
  toggleWatch: vi.fn(),
  ensureWatch: vi.fn(),
}));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({ getJob: vi.fn(() => null) }));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({})),
  getUserSettings: vi.fn(() => ({})),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));

import { deleteListingsByFilter } from '../../lib/services/storage/listingsStorage.js';
import { getSettings, getUserSettings } from '../../lib/services/storage/settingsStorage.js';
import { isAdmin } from '../../lib/api/security.js';
import listingsPlugin from '../../lib/api/routes/listingsRouter.js';
import { filterMask } from '../../lib/services/connectivity/mobileBits.js';

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.session = { currentUser: 'user-1' };
  });
  await app.register(listingsPlugin);
  await app.ready();
  return app;
}

/** The filter object the route handed the storage layer on its last call. */
const lastFilters = () => deleteListingsByFilter.mock.calls.at(-1)[0];

/** Whether that call asked for a hard delete. */
const lastHardDelete = () => deleteListingsByFilter.mock.calls.at(-1)[1];

const del = async (body) => {
  const app = await buildApp();
  return app.inject({ method: 'DELETE', url: '/filtered', payload: body });
};

beforeEach(() => {
  vi.clearAllMocks();
  deleteListingsByFilter.mockReturnValue({ changes: 7 });
  getSettings.mockResolvedValue({});
  getUserSettings.mockReturnValue({});
  isAdmin.mockReturnValue(false);
});

describe('DELETE /filtered', () => {
  it('reports how many listings it removed', async () => {
    const response = await del({});

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ deleted: 7 });
  });

  it('refuses a non-admin in demo mode', async () => {
    getSettings.mockResolvedValue({ demoMode: true });

    const response = await del({ hardDelete: true });

    expect(response.statusCode).toBe(403);
    expect(deleteListingsByFilter).not.toHaveBeenCalled();
  });

  it('lets an admin through in demo mode', async () => {
    getSettings.mockResolvedValue({ demoMode: true });
    isAdmin.mockReturnValue(true);

    const response = await del({});

    expect(response.statusCode).toBe(200);
    expect(lastFilters().isAdmin).toBe(true);
  });

  it('scopes the delete to the session user', async () => {
    await del({});

    expect(lastFilters()).toMatchObject({ userId: 'user-1', isAdmin: false });
  });

  it('soft deletes unless the body asks for a hard delete', async () => {
    await del({});
    expect(lastHardDelete()).toBe(false);

    await del({ hardDelete: true });
    expect(lastHardDelete()).toBe(true);

    // Only the boolean counts. A truthy string arriving from a hand-built request must not be
    // enough to make an irreversible delete out of a reversible one.
    await del({ hardDelete: 'true' });
    expect(lastHardDelete()).toBe(false);
  });

  it('passes the overview filters through', async () => {
    await del({
      freeTextFilter: 'Altbau',
      providerFilter: 'immoscout',
      activityFilter: 'false',
      watchListFilter: 'true',
      hiddenOnly: 'true',
    });

    expect(lastFilters()).toMatchObject({
      freeTextFilter: 'Altbau',
      providerFilter: 'immoscout',
      activityFilter: false,
      watchListFilter: true,
      hiddenOnly: true,
    });
  });

  it('drops a status the overview cannot show', async () => {
    await del({ statusFilter: 'accepted' });
    expect(lastFilters().statusFilter).toBe('accepted');

    await del({ statusFilter: "' OR 1=1 --" });
    expect(lastFilters().statusFilter).toBeUndefined();
  });

  it('drops a travel time mode that names no column', async () => {
    await del({ travelTimeMode: 'transit', travelTimeMaxMinutes: '30' });
    expect(lastFilters().travelTimeFilter).toEqual({ mode: 'transit', maxMinutes: 30, label: null });

    await del({ travelTimeMode: 'teleport', travelTimeMaxMinutes: '30' });
    expect(lastFilters().travelTimeFilter).toBeNull();
  });

  it('builds the mobile mask from names rather than taking a number', async () => {
    await del({ connectivityMobileTech: '5g', connectivityMobileOperator: 'dt' });
    expect(lastFilters().connectivityMobileMask).toBe(filterMask('5g', 'dt'));

    // An operator nobody recognises drops out, leaving the technology asking about every operator
    // rather than about a bit that means something else.
    await del({ connectivityMobileTech: '5g', connectivityMobileOperator: 'telekom' });
    expect(lastFilters().connectivityMobileMask).toBe(filterMask('5g', null));

    await del({ connectivityMobileMask: 4095 });
    expect(lastFilters().connectivityMobileMask).toBeNull();
  });

  it('derives the affordability band from the stored profile, never from the body', async () => {
    await del({ affordabilityFilter: 'affordable', minPrice: 1, maxPrice: 2 });

    // No profile is configured, so the filter yields no band at all - and the raw bounds in the
    // body were never read in the first place.
    expect(lastFilters().affordabilityBand).toBeNull();
    expect(lastFilters().minPrice).toBeUndefined();
    expect(lastFilters().maxPrice).toBeUndefined();
  });

  it('answers 500 rather than leaking a storage failure', async () => {
    deleteListingsByFilter.mockImplementation(() => {
      throw new Error('database is locked');
    });

    const response = await del({});

    expect(response.statusCode).toBe(500);
  });
});
