/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

const root = (await import('node:path')).resolve('.');

let upserted;

/**
 * Register the settings plugin against a fastify double and return its POST handler.
 *
 * @param {boolean} [isAdmin=true]
 * @returns {Promise<(request: any, reply: any) => Promise<any>>}
 */
async function loadPostHandler(isAdmin = true) {
  upserted = [];
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => ({ demoMode: false }),
    getPublicSettings: async () => ({}),
    upsertSettings: (settings) => upserted.push(settings),
  }));
  vi.doMock(root + '/lib/api/security.js', () => ({ isAdmin: () => isAdmin }));
  vi.doMock(root + '/lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
  vi.doMock(root + '/lib/services/storage/userStorage.js', () => ({ ensureDemoUserExists: vi.fn() }));
  vi.doMock(root + '/lib/utils.js', () => ({ updateConfigOnDisk: vi.fn() }));

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
 * `listingRetentionDays` drives an irreversible nightly delete, so a value that never should have
 * been stored has to be rejected at the route rather than acted on later.
 */
describe('POST /api/admin/generalSettings - listingRetentionDays', () => {
  const post = async (body, isAdmin = true) => {
    const handler = await loadPostHandler(isAdmin);
    const reply = replyDouble();
    await handler({ body }, reply);
    return reply.recorded;
  };

  it('stores a valid period as a number', async () => {
    const result = await post({ listingRetentionDays: '30' });
    expect(result.status).toBe(200);
    expect(upserted[0].listingRetentionDays).toBe(30);
  });

  it('accepts zero, which disables the purge', async () => {
    await post({ listingRetentionDays: 0 });
    expect(upserted[0].listingRetentionDays).toBe(0);
  });

  it('rejects a negative period', async () => {
    const result = await post({ listingRetentionDays: -1 });
    expect(result.status).toBe(400);
    expect(upserted).toEqual([]);
  });

  it('rejects a period beyond a year', async () => {
    const result = await post({ listingRetentionDays: 366 });
    expect(result.status).toBe(400);
  });

  it('rejects a fractional period', async () => {
    const result = await post({ listingRetentionDays: 1.5 });
    expect(result.status).toBe(400);
  });

  it('rejects text', async () => {
    const result = await post({ listingRetentionDays: 'forever' });
    expect(result.status).toBe(400);
  });

  it('rejects an empty value instead of reading it as zero', async () => {
    // Number('') is 0, which would silently turn a cleared input field into "never delete".
    expect((await post({ listingRetentionDays: '' })).status).toBe(400);
    expect((await post({ listingRetentionDays: null })).status).toBe(400);
  });

  it('leaves the setting untouched when the request does not mention it', async () => {
    const result = await post({ port: 9998 });
    expect(result.status).toBe(200);
    expect(upserted[0]).not.toHaveProperty('listingRetentionDays');
  });
});
