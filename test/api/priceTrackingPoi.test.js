/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

import { TRACKING_POIS } from '../../lib/TRACKING_POIS.js';

const root = (await import('node:path')).resolve('.');

let trackPoi;

/**
 * Register the settings plugin against a fastify double and return its POST handler.
 *
 * @param {Object} [stored] The settings as they already are, before this request.
 * @returns {Promise<(request: any, reply: any) => Promise<any>>}
 */
async function loadPostHandler(stored = {}) {
  trackPoi = vi.fn();
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => ({ demoMode: false, ...stored }),
    getPublicSettings: async () => ({}),
    upsertSettings: vi.fn(),
  }));
  vi.doMock(root + '/lib/api/security.js', () => ({ isAdmin: () => true }));
  vi.doMock(root + '/lib/services/tracking/Tracker.js', () => ({ trackPoi }));
  vi.doMock(root + '/lib/services/storage/userStorage.js', () => ({ ensureDemoUserExists: vi.fn() }));
  const utils = await vi.importActual(root + '/lib/utils.js');
  vi.doMock(root + '/lib/utils.js', () => ({ ...utils, updateConfigOnDisk: vi.fn() }));

  const plugin = (await import(root + '/lib/api/routes/generalSettingsRoute.js')).default;
  const routes = {};
  await plugin({ get: () => {}, post: (path, handler) => (routes[`POST ${path}`] = handler) });
  return routes['POST /'];
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
      return this;
    },
  };
}

/**
 * Turning price tracking on and off is worth counting, but only the *change* is: the Execution page
 * posts every one of its fields on every save, so a POI fired whenever the value arrived would
 * report how often that page was saved.
 */
describe('POST /api/admin/generalSettings - price tracking POIs', () => {
  const post = async (body, stored) => {
    const handler = await loadPostHandler(stored);
    const reply = replyDouble();
    await handler({ body }, reply);
    return reply.recorded;
  };

  /** Which of the two feature POIs were sent. @returns {string[]} */
  const featurePois = () =>
    trackPoi.mock.calls.map(([poi]) => poi).filter((poi) => String(poi).startsWith('FEATURE_TRACKING'));

  it('reports switching the feature on', async () => {
    const result = await post({ priceTrackingEnabled: true }, { priceTrackingEnabled: false });

    expect(result.status).toBe(200);
    expect(featurePois()).toEqual([TRACKING_POIS.FEATURE_TRACKING_ENABLED]);
  });

  it('reports switching the feature off', async () => {
    const result = await post({ priceTrackingEnabled: false }, { priceTrackingEnabled: true });

    expect(result.status).toBe(200);
    expect(featurePois()).toEqual([TRACKING_POIS.FEATURE_TRACKING_DISABLED]);
  });

  it('treats a first-ever enable as a change, since the stored default is off', async () => {
    await post({ priceTrackingEnabled: true }, {});

    expect(featurePois()).toEqual([TRACKING_POIS.FEATURE_TRACKING_ENABLED]);
  });

  it.each([
    ['on and saved again', true, { priceTrackingEnabled: true }],
    ['off and saved again', false, { priceTrackingEnabled: false }],
    ['off and never set', false, {}],
  ])('says nothing when the feature was already %s', async (_what, sent, stored) => {
    await post({ priceTrackingEnabled: sent }, stored);

    expect(featurePois()).toEqual([]);
  });

  it('says nothing when the save does not carry the field at all', async () => {
    // Saving the System half of the settings must not report anything about the Execution half.
    await post({ baseUrl: 'https://fredy.example' }, { priceTrackingEnabled: true });

    expect(featurePois()).toEqual([]);
  });

  it('does not confuse a truthy value for the switch being on', async () => {
    // The route coerces to a real boolean before storing; the comparison has to see that value and
    // not the raw payload, or "enabled" would be reported every time a save carried a string.
    await post({ priceTrackingEnabled: 'true' }, { priceTrackingEnabled: false });

    expect(featurePois()).toEqual([]);
  });

  it('leaves the other settings POIs alone', async () => {
    await post({ baseUrl: 'https://fredy.example', priceTrackingEnabled: true }, { priceTrackingEnabled: false });

    expect(trackPoi.mock.calls.map(([poi]) => poi)).toEqual([
      TRACKING_POIS.BASE_URL_SETTING,
      TRACKING_POIS.FEATURE_TRACKING_ENABLED,
    ]);
  });
});
