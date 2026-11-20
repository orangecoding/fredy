/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_DRAFT_INSTRUCTIONS,
  MAX_DRAFT_INSTRUCTIONS_LENGTH,
} from '../../lib/services/application/draftInstructions.js';

const root = (await import('node:path')).resolve('.');

/** @type {Array<{settings: Record<string, any>, userId: string|null}>} */
let upserted;

/**
 * Register the user-settings plugin against a fastify double and hand back its routes.
 *
 * @param {Object} [options]
 * @param {boolean} [options.demoMode]
 * @param {Record<string, any>} [options.stored]
 * @returns {Promise<Record<string, (request: any, reply: any) => Promise<any>>>}
 */
async function loadRoutes({ demoMode = false, stored = {} } = {}) {
  upserted = [];
  vi.resetModules();

  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => ({ demoMode }),
    getUserSettings: () => stored,
    getAddresses: () => [],
    upsertSettings: (settings, userId = null) => upserted.push({ settings, userId }),
  }));
  vi.doMock(root + '/lib/api/security.js', () => ({ isAdmin: () => false }));
  vi.doMock(root + '/lib/services/tracking/Tracker.js', () => ({ trackPoi: async () => {} }));
  vi.doMock(root + '/lib/services/geocoding/geoCodingService.js', () => ({ geocodeAddress: vi.fn() }));
  vi.doMock(root + '/lib/services/geocoding/autocompleteService.js', () => ({ autocompleteAddress: vi.fn() }));
  vi.doMock(root + '/lib/services/geocoding/distanceService.js', () => ({
    updateDistancesForAddressChange: vi.fn(),
  }));
  vi.doMock(root + '/lib/services/crons/geocoding-cron.js', () => ({ runGeoCordTask: vi.fn() }));

  const plugin = (await import(root + '/lib/api/routes/userSettingsRoute.js')).default;
  /** @type {Record<string, any>} */
  const routes = {};
  await plugin({
    get: (path, handler) => (routes[`GET ${path}`] = handler),
    post: (path, handler) => (routes[`POST ${path}`] = handler),
  });
  return routes;
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

const request = (body) => ({ session: { currentUser: 'user-1' }, body });
const PATH = '/application-draft-instructions';

describe('GET /api/user/settings/application-draft-instructions', () => {
  it('hands the editor the default it starts from, and null while the user has none', async () => {
    const routes = await loadRoutes();

    expect(await routes[`GET ${PATH}`](request())).toEqual({
      instructions: null,
      defaultInstructions: DEFAULT_DRAFT_INSTRUCTIONS,
      maxLength: MAX_DRAFT_INSTRUCTIONS_LENGTH,
    });
  });

  it("answers with the user's own instructions", async () => {
    const routes = await loadRoutes({ stored: { application_draft_instructions: 'Mine.' } });

    expect((await routes[`GET ${PATH}`](request())).instructions).toBe('Mine.');
  });
});

describe('POST /api/user/settings/application-draft-instructions', () => {
  it('stores the instructions against the calling user, and the default as nothing', async () => {
    const routes = await loadRoutes();

    expect(await routes[`POST ${PATH}`](request({ instructions: ' Keep it short. ' }), replyDouble())).toEqual({
      success: true,
      instructions: 'Keep it short.',
    });
    await routes[`POST ${PATH}`](request({ instructions: DEFAULT_DRAFT_INSTRUCTIONS }), replyDouble());

    expect(upserted).toEqual([
      { settings: { application_draft_instructions: 'Keep it short.' }, userId: 'user-1' },
      { settings: { application_draft_instructions: null }, userId: 'user-1' },
    ]);
  });

  it('refuses instructions past the cap with a 400, and stores nothing', async () => {
    const routes = await loadRoutes();
    const reply = replyDouble();

    await routes[`POST ${PATH}`](request({ instructions: 'x'.repeat(MAX_DRAFT_INSTRUCTIONS_LENGTH + 1) }), reply);

    expect(reply.recorded.status).toBe(400);
    expect(upserted).toEqual([]);
  });

  it('is refused in demo mode', async () => {
    const routes = await loadRoutes({ demoMode: true });
    const reply = replyDouble();

    await routes[`POST ${PATH}`](request({ instructions: 'Mine.' }), reply);

    expect(reply.recorded.status).toBe(403);
    expect(upserted).toEqual([]);
  });
});
