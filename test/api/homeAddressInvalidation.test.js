/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const root = (await import('node:path')).resolve('.');
const settingsStoragePath = root + '/lib/services/storage/settingsStorage.js';
const geoCodingPath = root + '/lib/services/geocoding/geoCodingService.js';
const distanceServicePath = root + '/lib/services/geocoding/distanceService.js';
const trackerPath = root + '/lib/services/tracking/Tracker.js';
const geocodingCronPath = root + '/lib/services/crons/geocoding-cron.js';

let stored;
let invalidations;
let sweeps;

/**
 * A server with the user settings routes mounted over an in-memory settings store.
 *
 * Everything a saved address sets off is counted rather than performed: the geocode, the distance
 * recalculation and the geocoding cron are all somebody else's tested behaviour, and what these
 * tests are about is which of them should happen at all.
 *
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function buildServer() {
  vi.resetModules();
  vi.doMock(settingsStoragePath, () => ({
    getSettings: async () => ({ demoMode: false }),
    getUserSettings: () => stored,
    getAddresses: (settings) => (Array.isArray(settings?.home_addresses) ? settings.home_addresses : []),
    upsertSettings: (values) => Object.assign(stored, values),
  }));
  vi.doMock(geoCodingPath, () => ({
    // Deterministic and distinct per address, so "the place moved" is a real difference.
    geocodeAddress: async (address) => ({ lat: 52 + address.length / 100, lng: 13 + address.length / 100 }),
  }));
  vi.doMock(distanceServicePath, () => ({
    updateDistancesForAddressChange: (userId, addresses) => invalidations.push(addresses),
  }));
  vi.doMock(trackerPath, () => ({ trackPoi: async () => {} }));
  vi.doMock(geocodingCronPath, () => ({ runGeoCordTask: () => sweeps.push(true) }));

  const plugin = (await import(root + '/lib/api/routes/userSettingsRoute.js')).default;
  const app = Fastify();
  app.addHook('preHandler', (request, _reply, done) => {
    request.session = { currentUser: 'user-1' };
    request.currentUser = { id: 'user-1', isAdmin: false };
    done();
  });
  await app.register(plugin, { prefix: '/api/user/settings' });
  return app;
}

const save = (app, home_addresses) =>
  app.inject({ method: 'POST', url: '/api/user/settings/home-address', payload: { home_addresses } });

beforeEach(() => {
  stored = {};
  invalidations = [];
  sweeps = [];
});

describe('POST /api/user/settings/home-address, what a save invalidates', () => {
  /**
   * Saving addresses recalculates every stored distance and puts every listing back in front of the
   * travel-time sweeper. That is right when a place moves and pointless when it does not: opening
   * the form and pressing Save should not queue up the whole database.
   */
  it('does not re-measure the world when nothing routing-relevant changed', async () => {
    const app = await buildServer();
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit' }]);
    expect(invalidations).toHaveLength(1);

    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit' }]);

    expect(invalidations).toHaveLength(1);
    await app.close();
  });

  /**
   * Issue #418: a listing whose first geocode failed shows "no valid geocoordinates" until the
   * six-hourly sweep comes round, and the only remedy anybody has found is to open this form and
   * press Save. That has nothing to do with whether an address moved, so it must not sit behind the
   * guard above, or the fix would be to take the remedy away.
   */
  it('always retries the geocoding of listings that have none, even on an unchanged save', async () => {
    const app = await buildServer();
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit' }]);
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit' }]);

    expect(sweeps).toHaveLength(2);
    await app.close();
  });

  /** How far is too far is the job's to say, so it has no business on the address. */
  it('never stores a commute limit on the address', async () => {
    const app = await buildServer();
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit', maxMinutes: 35 }]);

    expect(stored.home_addresses[0].maxMinutes).toBeUndefined();
    await app.close();
  });

  it('still re-measures when the address itself changes', async () => {
    const app = await buildServer();
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit' }]);
    await save(app, [{ label: 'Work', address: 'Another Office Street 12', mode: 'transit' }]);

    expect(invalidations).toHaveLength(2);
    await app.close();
  });

  it('still re-measures when the mode changes', async () => {
    const app = await buildServer();
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit' }]);
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'car' }]);

    expect(invalidations).toHaveLength(2);
    await app.close();
  });

  /**
   * The departure decides which timetable a journey is planned against, so the sweeper treats a row
   * measured at 08:00 as answering nothing about 18:00. If the guard forgot it, every stored transit
   * time would go on describing a rush hour the user no longer travels in.
   */
  it('still re-measures when the departure moves', async () => {
    const app = await buildServer();
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit', departure: { time: '08:00' } }]);
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit', departure: { time: '17:30' } }]);

    expect(invalidations).toHaveLength(2);
    await app.close();
  });

  /**
   * Travel times and distances are both stored under the label, so a rename really does orphan them.
   * The sweeper can adopt a renamed journey without a request, but only if it is asked to look.
   */
  it('still re-measures when an address is renamed', async () => {
    const app = await buildServer();
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit' }]);
    await save(app, [{ label: 'The office', address: 'Office Street 1', mode: 'transit' }]);

    expect(invalidations).toHaveLength(2);
    await app.close();
  });

  it('still re-measures when a second address is added', async () => {
    const app = await buildServer();
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit' }]);
    await save(app, [
      { label: 'Work', address: 'Office Street 1', mode: 'transit' },
      { label: 'School', address: 'School Road 22', mode: 'transit' },
    ]);

    expect(invalidations).toHaveLength(2);
    await app.close();
  });

  it('still re-measures when an address is removed', async () => {
    const app = await buildServer();
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit' }]);
    await save(app, []);

    expect(invalidations).toHaveLength(2);
    expect(stored.home_addresses).toBeNull();
    await app.close();
  });

  it('does nothing at all when an empty list is saved over an empty list', async () => {
    const app = await buildServer();
    await save(app, []);

    expect(invalidations).toHaveLength(0);
    await app.close();
  });
});
