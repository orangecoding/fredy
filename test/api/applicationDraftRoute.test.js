/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');

/** @type {string[]} */
let tracked;
const writeApplicationDraft = vi.fn();

const listing = {
  id: 'abc',
  provider: 'casa',
  dealType: 'rent',
  title: 'Trilocale luminoso',
  address: 'Via Roma 1, Milano',
  price: 1200,
  link: 'https://example.com/1',
  application_draft: 'Buongiorno, sono interessato.',
  application_draft_model: 'gpt-test',
  application_draft_generated_at: 1700000000000,
};

/**
 * Register the listings plugin against a fastify double and return its routes, with the shared
 * draft service's write replaced and everything it answers from real.
 *
 * @param {Object} [options]
 * @param {Record<string, any>} [options.settings] Global settings.
 * @returns {Promise<Record<string, (request: any, reply: any) => Promise<any>>>}
 */
async function loadRoutes({ settings = {} } = {}) {
  tracked = [];
  vi.resetModules();

  vi.doMock(root + '/lib/services/storage/listingsStorage.js', () => ({
    getListingById: () => listing,
    setApplicationDraft: vi.fn(),
  }));
  vi.doMock(root + '/lib/services/storage/watchListStorage.js', () => ({}));
  vi.doMock(root + '/lib/api/security.js', () => ({ isAdmin: () => false }));
  vi.doMock(root + '/lib/services/storage/jobStorage.js', () => ({ getJob: () => null }));
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => settings,
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
  vi.doMock(root + '/lib/utils.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getProviders: async () => [{ metaInformation: { id: 'casa', name: 'Casa.it' } }],
    nullOrEmpty: (value) => value == null || value === '',
  }));
  vi.doMock(root + '/lib/services/application/applicationDraftService.js', async (importOriginal) => ({
    ...(await importOriginal()),
    writeApplicationDraft,
  }));

  const plugin = (await import(root + '/lib/api/routes/listingsRouter.js')).default;
  /** @type {Record<string, any>} */
  const routes = {};
  await plugin({
    get: (path, handler) => (routes[`GET ${path}`] = handler),
    post: (path, handler) => (routes[`POST ${path}`] = handler),
    delete: () => {},
    put: () => {},
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

const request = (body = {}) => ({
  params: { listingId: 'abc' },
  query: {},
  body,
  session: { currentUser: 'user-1' },
});

beforeEach(() => writeApplicationDraft.mockReset());

describe('GET /api/listings/:listingId/application', () => {
  it('shows the stored AI draft next to the letter, and whether a new one can be written', async () => {
    const configured = { llmEnabled: true, llmBaseUrl: 'https://llm.example/v1', llmModel: 'gpt-test' };
    const routes = await loadRoutes({ settings: configured });

    const result = await routes['GET /:listingId/application'](request(), replyDouble());

    expect(result.text).toContain('Trilocale luminoso');
    expect(result.aiDraft).toEqual({
      available: true,
      draft: { text: 'Buongiorno, sono interessato.', model: 'gpt-test', generatedAt: 1700000000000 },
    });
  });

  it('says drafts cannot be written while the admin has not set them up', async () => {
    const routes = await loadRoutes();

    const result = await routes['GET /:listingId/application'](request(), replyDouble());

    expect(result.aiDraft.available).toBe(false);
  });
});

describe('POST /api/listings/:listingId/application/draft', () => {
  it('writes through the shared service as the caller, in the language they picked', async () => {
    const draft = { text: 'Hello', model: 'gpt-test', generatedAt: 1 };
    writeApplicationDraft.mockResolvedValue({ ok: true, draft, reused: false, listing });
    const routes = await loadRoutes();

    const result = await routes['POST /:listingId/application/draft'](request({ language: 'en' }), replyDouble());

    expect(writeApplicationDraft).toHaveBeenCalledWith({ id: 'user-1', isAdmin: false }, 'abc', { language: 'en' });
    expect(result).toEqual(draft);
    expect(tracked).toContain('APPLICATION_AI_DRAFT_WRITTEN');
  });

  it('answers a refusal with the status its reason stands for', async () => {
    writeApplicationDraft.mockResolvedValue({ ok: false, reason: 'unavailable', error: 'Not set up.' });
    const routes = await loadRoutes();
    const reply = replyDouble();

    await routes['POST /:listingId/application/draft'](request(), reply);

    expect(reply.recorded).toEqual({ status: 503, payload: { message: 'Not set up.' } });
    expect(tracked).not.toContain('APPLICATION_AI_DRAFT_WRITTEN');
  });
});
