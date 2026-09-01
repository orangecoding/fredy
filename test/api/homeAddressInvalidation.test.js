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
const listingsStoragePath = root + '/lib/services/storage/listingsStorage.js';

let stored;
let invalidations;
let sweeps;
let queuedCount;
let progress;

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
    // Answers with how many listings it queued, which is what the form reports back to the user.
    updateDistancesForAddressChange: (userId, addresses) => {
      invalidations.push(addresses);
      return queuedCount;
    },
  }));
  vi.doMock(listingsStoragePath, () => ({ getTravelTimeProgress: () => progress }));
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
  queuedCount = 174;
  progress = { measured: 12, total: 174 };
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

describe('POST /api/user/settings/home-address, place types', () => {
  it('stores a place type without geocoding it', async () => {
    const app = await buildServer();

    const response = await save(app, [{ kind: 'category', category: 'supermarket', label: 'Groceries', mode: 'walk' }]);

    expect(response.statusCode).toBe(200);
    const [saved] = stored.home_addresses;
    // No coordinates, and that is the point rather than an omission: the supermarket it resolves to
    // is a different one for every listing, so there is nothing to geocode once.
    expect(saved).toEqual({ kind: 'category', category: 'supermarket', label: 'Groceries', mode: 'walk' });
    expect(saved.coords).toBeUndefined();
  });

  it('names a place type after its category when the user leaves the name blank', async () => {
    const app = await buildServer();

    await save(app, [{ kind: 'category', category: 'pharmacy', mode: 'walk' }]);

    expect(stored.home_addresses[0].label).toBe('pharmacy');
  });

  it('refuses a category it cannot look for', async () => {
    const app = await buildServer();

    const response = await save(app, [{ kind: 'category', category: 'casino', label: 'Fun', mode: 'walk' }]);

    // Rejected rather than dropped: an unknown category would save cleanly and then silently never
    // produce a travel time, with nothing on screen to explain why.
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('casino');
  });

  it('still refuses two entries sharing one name', async () => {
    const app = await buildServer();

    const response = await save(app, [
      { kind: 'category', category: 'supermarket', label: 'Nearby', mode: 'walk' },
      { label: 'Nearby', address: 'Office Street 1', mode: 'transit' },
    ]);

    // Travel times are stored per label whatever kind of entry produced them, so the two would
    // overwrite each other every sweep.
    expect(response.statusCode).toBe(400);
  });

  it('re-measures every listing when a place type changes category', async () => {
    const app = await buildServer();
    await save(app, [{ kind: 'category', category: 'supermarket', label: 'Nearby', mode: 'walk' }]);
    invalidations.length = 0;

    await save(app, [{ kind: 'category', category: 'gym', label: 'Nearby', mode: 'walk' }]);

    // The label and the mode are unchanged and there are no coordinates to compare, so without the
    // category in the routing signature this would look like a save that changed nothing.
    expect(invalidations).toHaveLength(1);
  });

  it('does not re-measure when a place type is saved unchanged', async () => {
    const app = await buildServer();
    await save(app, [{ kind: 'category', category: 'supermarket', label: 'Nearby', mode: 'walk' }]);
    invalidations.length = 0;

    await save(app, [{ kind: 'category', category: 'supermarket', label: 'Nearby', mode: 'walk' }]);

    expect(invalidations).toHaveLength(0);
  });

  it('keeps addresses and place types side by side in one list', async () => {
    const app = await buildServer();

    await save(app, [
      { label: 'Work', address: 'Office Street 1', mode: 'transit' },
      { kind: 'category', category: 'bakery', label: 'Bread', mode: 'walk' },
    ]);

    expect(stored.home_addresses).toHaveLength(2);
    expect(stored.home_addresses[0].coords).toBeDefined();
    expect(stored.home_addresses[1].coords).toBeUndefined();
  });
});

describe('telling the user what a save set off', () => {
  /**
   * The sweeper takes a few listings every two hours, on purpose, because the services behind it are
   * run by volunteers. On a few hundred listings that is most of a day, and a form that answers only
   * "Saved" leaves somebody watching a page that will not change until tomorrow - which reads as the
   * feature being broken rather than as it being polite.
   */
  it('reports how many listings a change queued', async () => {
    const app = await buildServer();

    const response = await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit' }]);

    expect(response.json().queued).toBe(174);
  });

  it('reports nothing queued when nothing routing-relevant changed', async () => {
    const app = await buildServer();
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit' }]);

    const response = await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit' }]);

    // Re-saving an untouched form queues nothing, so the toast must not claim otherwise.
    expect(response.json().queued).toBe(0);
    expect(invalidations).toHaveLength(1);
  });

  it('reports the queue when every address is cleared', async () => {
    const app = await buildServer();
    await save(app, [{ label: 'Work', address: 'Office Street 1', mode: 'transit' }]);

    const response = await save(app, []);

    expect(response.json().queued).toBe(174);
  });

  it('answers how far through the backlog the sweeper is', async () => {
    const app = await buildServer();

    const response = await app.inject({ method: 'GET', url: '/api/user/settings/travel-time-progress' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ measured: 12, total: 174 });
  });
});
