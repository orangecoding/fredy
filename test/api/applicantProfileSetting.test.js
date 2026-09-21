/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');

/** @type {Array<{settings: Record<string, any>, userId: string|null}>} */
let upserted;

/**
 * Register the user-settings plugin against a fastify double and hand back its POST handlers.
 *
 * @param {Object} [options]
 * @param {boolean} [options.demoMode]
 * @param {boolean} [options.admin]
 * @param {Record<string, any>} [options.stored]
 * @returns {Promise<Record<string, (request: any, reply: any) => Promise<any>>>}
 */
async function loadRoutes({ demoMode = false, admin = false, stored = {} } = {}) {
  upserted = [];
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => ({ demoMode }),
    getUserSettings: () => stored,
    getAddresses: () => [],
    upsertSettings: (settings, userId = null) => upserted.push({ settings, userId }),
  }));
  vi.doMock(root + '/lib/api/security.js', () => ({ isAdmin: () => admin }));
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
  await plugin({ get: () => {}, post: (path, handler) => (routes[path] = handler) });
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

const profile = { firstName: 'Max', lastName: 'Mustermann', netIncome: 3800, smoker: false };

describe('POST /api/user/settings/applicant-profile', () => {
  /** @type {(request: any, reply: any) => Promise<any>} */
  let handler;

  beforeEach(async () => {
    handler = (await loadRoutes())['/applicant-profile'];
  });

  it('is registered', () => {
    expect(typeof handler).toBe('function');
  });

  it('stores the profile against the calling user', async () => {
    await handler(request({ applicant_profile: profile }), replyDouble());
    expect(upserted).toEqual([{ settings: { applicant_profile: profile }, userId: 'user-1' }]);
  });

  it('clears the profile when null is passed', async () => {
    await handler(request({ applicant_profile: null }), replyDouble());
    expect(upserted).toEqual([{ settings: { applicant_profile: null }, userId: 'user-1' }]);
  });

  it('refuses anything that is not an object', async () => {
    const reply = replyDouble();
    await handler(request({ applicant_profile: 'Max' }), reply);
    expect(reply.recorded.status).toBe(400);
    expect(upserted).toEqual([]);
  });

  it('refuses an array, which would otherwise pass a typeof check', async () => {
    const reply = replyDouble();
    await handler(request({ applicant_profile: [] }), reply);
    expect(reply.recorded.status).toBe(400);
  });

  it('refuses a profile large enough to bloat the row every request reads', async () => {
    // The neighbouring template route caps at 20k for exactly this reason; the body limit is 50 MB.
    const reply = replyDouble();
    await handler(request({ applicant_profile: { extra: 'x'.repeat(50_000) } }), reply);
    expect(reply.recorded.status).toBe(400);
    expect(upserted).toEqual([]);
  });

  it('refuses to write while demo mode is on', async () => {
    const routes = await loadRoutes({ demoMode: true, admin: false });
    const reply = replyDouble();
    await routes['/applicant-profile'](request({ applicant_profile: profile }), reply);
    expect(reply.recorded.status).toBe(403);
    expect(upserted).toEqual([]);
  });

  it('still lets an admin write while demo mode is on', async () => {
    const routes = await loadRoutes({ demoMode: true, admin: true });
    await routes['/applicant-profile'](request({ applicant_profile: profile }), replyDouble());
    expect(upserted).toHaveLength(1);
  });
});

describe('POST /api/user/settings/application-templates', () => {
  /** @type {(request: any, reply: any) => Promise<any>} */
  let handler;

  beforeEach(async () => {
    handler = (await loadRoutes())['/application-templates'];
  });

  it('is registered', () => {
    expect(typeof handler).toBe('function');
  });

  it('stores an override for one language and deal type', async () => {
    const templates = { de: { rent: 'Mein eigenes Anschreiben' } };
    await handler(request({ application_templates: templates }), replyDouble());
    expect(upserted).toEqual([{ settings: { application_templates: templates }, userId: 'user-1' }]);
  });

  it('clears every override when null is passed', async () => {
    await handler(request({ application_templates: null }), replyDouble());
    expect(upserted).toEqual([{ settings: { application_templates: null }, userId: 'user-1' }]);
  });

  it('refuses a language it ships no letters for', async () => {
    const reply = replyDouble();
    await handler(request({ application_templates: { tr: { rent: 'x' } } }), reply);
    expect(reply.recorded.status).toBe(400);
    expect(upserted).toEqual([]);
  });

  it('refuses a deal type that is neither renting nor buying', async () => {
    const reply = replyDouble();
    await handler(request({ application_templates: { de: { lease: 'x' } } }), reply);
    expect(reply.recorded.status).toBe(400);
  });

  it('refuses a template that is not text', async () => {
    const reply = replyDouble();
    await handler(request({ application_templates: { de: { rent: 42 } } }), reply);
    expect(reply.recorded.status).toBe(400);
  });

  it('refuses a template long enough to bloat the settings row', async () => {
    const reply = replyDouble();
    await handler(request({ application_templates: { de: { rent: 'x'.repeat(20_001) } } }), reply);
    expect(reply.recorded.status).toBe(400);
    expect(upserted).toEqual([]);
  });

  it('refuses to write while demo mode is on', async () => {
    const routes = await loadRoutes({ demoMode: true, admin: false });
    const reply = replyDouble();
    await routes['/application-templates'](request({ application_templates: { de: { rent: 'x' } } }), reply);
    expect(reply.recorded.status).toBe(403);
  });
});

describe('POST /api/user/settings/application-preview', () => {
  /** @type {(request: any, reply: any) => Promise<any>} */
  let handler;

  beforeEach(async () => {
    handler = (await loadRoutes({ stored: { applicant_profile: profile } }))['/application-preview'];
  });

  it('is registered', () => {
    expect(typeof handler).toBe('function');
  });

  it("renders a draft against the caller's own profile", async () => {
    const result = await handler(
      request({ template: 'Hallo, ich bin {{applicant.fullName}}.', language: 'de', dealType: 'rent' }),
      replyDouble(),
    );
    expect(result.text).toBe('Hallo, ich bin Max Mustermann.');
  });

  it('hands back the shipped letter when no draft is passed, so the editor can seed its field', async () => {
    const result = await handler(request({ template: null, language: 'de', dealType: 'buy' }), replyDouble());
    expect(result.template).toContain('Besichtigungsanfrage');
    expect(result.text).toContain('Besichtigungsanfrage');
  });

  it('reports what is missing and what is misspelled', async () => {
    const result = await handler(
      request({ template: '{{applicant.occupation}} {{applicant.nachname}}', language: 'de', dealType: 'rent' }),
      replyDouble(),
    );
    expect(result.missing).toEqual(['applicant.occupation']);
    expect(result.unknown).toEqual(['applicant.nachname']);
  });

  it('refuses a language it writes no letters in', async () => {
    const reply = replyDouble();
    await handler(request({ template: 'x', language: 'tr', dealType: 'rent' }), reply);
    expect(reply.recorded.status).toBe(400);
  });

  it('refuses a draft long enough to be an attack rather than a letter', async () => {
    const reply = replyDouble();
    await handler(request({ template: 'x'.repeat(20_001), language: 'de', dealType: 'rent' }), reply);
    expect(reply.recorded.status).toBe(400);
  });

  it('writes nothing, because a preview is a question', async () => {
    await handler(request({ template: 'x', language: 'de', dealType: 'rent' }), replyDouble());
    expect(upserted).toEqual([]);
  });

  it('still answers while demo mode is on, since it changes nothing', async () => {
    const routes = await loadRoutes({ demoMode: true, admin: false, stored: {} });
    const result = await routes['/application-preview'](
      request({ template: 'Hallo', language: 'de', dealType: 'rent' }),
      replyDouble(),
    );
    expect(result.text).toBe('Hallo');
  });
});
