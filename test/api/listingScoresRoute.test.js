/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

/**
 * Immo-bot score write-back (`POST /api/listings/scores`).
 *
 * Machine-to-machine endpoint: the backend used to UPDATE this file directly, which put two
 * SQLite engines on one file over a Docker Desktop mount and corrupted it. From here on
 * Fredy is the only process that opens the database and the backend goes through here,
 * authenticated by a shared service token rather than a user session (it scores across jobs).
 */
const root = (await import('node:path')).resolve('.');
const listingStoragePath = root + '/lib/services/storage/listingsStorage.js';

const TOKEN = 'test-service-token-123';

let scoreCalls;
let scoreBehavior;

async function buildServer() {
  vi.resetModules();
  scoreCalls = [];

  // The service router only touches the storage helper (plus the logger, which is real):
  // no session, no jobs, no providers - that is the whole point of the separate plugin.
  vi.doMock(listingStoragePath, () => ({
    updateListingScoresByLink: (link, scores) => {
      scoreCalls.push({ link, scores });
      return scoreBehavior(link, scores);
    },
  }));

  const plugin = (await import(root + '/lib/api/routes/serviceScoresRouter.js')).default;
  const app = Fastify();
  await app.register(plugin, { prefix: '/api/listings' });
  return app;
}

const postScores = (app, payload, token = TOKEN) =>
  app.inject({
    method: 'POST',
    url: '/api/listings/scores',
    headers: token == null ? {} : { 'x-service-token': token },
    payload,
  });

beforeEach(() => {
  process.env.FREDY_SERVICE_TOKEN = TOKEN;
  scoreBehavior = () => ({ updated: 1, skipped: false });
});

afterEach(() => {
  delete process.env.FREDY_SERVICE_TOKEN;
});

describe('POST /api/listings/scores', () => {
  it('rejects a missing token', async () => {
    const app = await buildServer();
    const response = await postScores(app, { items: [] }, null);
    expect(response.statusCode).toBe(403);
    expect(scoreCalls).toEqual([]);
  });

  it('rejects a wrong token', async () => {
    const app = await buildServer();
    const response = await postScores(app, { items: [] }, 'wrong-token-with-same-length!!');
    expect(response.statusCode).toBe(403);
    expect(scoreCalls).toEqual([]);
  });

  it('fails closed when no token is configured', async () => {
    delete process.env.FREDY_SERVICE_TOKEN;
    const app = await buildServer();
    const response = await postScores(app, { items: [{ link: 'https://x.example/1' }] });
    expect(response.statusCode).toBe(403);
    expect(scoreCalls).toEqual([]);
  });

  it('rejects a non-array payload', async () => {
    const app = await buildServer();
    const response = await postScores(app, { items: 'nope' });
    expect(response.statusCode).toBe(400);
  });

  it('writes every item and aggregates updated/skipped', async () => {
    scoreBehavior = (link) => (link.endsWith('/2') ? { updated: 0, skipped: true } : { updated: 1, skipped: false });
    const app = await buildServer();
    const response = await postScores(app, {
      items: [
        { link: 'https://x.example/1', investor_score: 42 },
        { link: 'https://x.example/2', investor_score: 0 },
      ],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ updated: 1, skipped: 1, invalid: 0, total: 2 });
    expect(scoreCalls.length).toBe(2);
  });

  it('counts items without a link as invalid and tolerates storage errors', async () => {
    scoreBehavior = () => {
      throw new Error('db exploded');
    };
    const app = await buildServer();
    const response = await postScores(app, {
      items: [{ investor_score: 1 }, { link: 'https://x.example/9', investor_score: 1 }],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ updated: 0, skipped: 0, invalid: 2, total: 2 });
  });

  it('answers zeros for an empty batch', async () => {
    const app = await buildServer();
    const response = await postScores(app, { items: [] });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ updated: 0, skipped: 0, invalid: 0, total: 0 });
  });
});
