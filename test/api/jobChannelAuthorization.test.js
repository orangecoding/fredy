/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import Fastify from 'fastify';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params = {}) => db.prepare(sql).all(params),
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    withTransaction: (cb) => db.transaction(() => cb(db))(),
  },
}));

// The route only reads `settings.demoMode`, and demo mode is irrelevant to channel
// authorisation. Mocking the whole module out avoids needing a `settings` table too.
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: async () => ({ demoMode: false }),
  upsertSettings: () => {},
}));

const ALICE = { id: 'u1', username: 'alice', isAdmin: false };
const BOB = { id: 'u2', username: 'bob', isAdmin: false };
const ADMIN = { id: 'a1', username: 'root', isAdmin: true };

/**
 * `POST /api/jobs` verifies `canUseChannel` runs for every referenced channel, with the resolved
 * user object, before the job is written. Nothing else in the route stack guards
 * `notification_adapter` against user input, so this is the entire security value of Task 7 - a
 * regression here means any authenticated user can attach somebody else's notification channel
 * (and, through it, their credentials) to their own job.
 */
describe('POST /api/jobs channel authorisation', () => {
  let app;
  let storage;
  let currentUser;

  const build = async () => {
    const plugin = (await import('../../lib/api/routes/jobRouter.js')).default;
    const instance = Fastify();
    instance.addHook('preHandler', async (request) => {
      request.currentUser = currentUser;
      request.session = { currentUser: currentUser.id };
    });
    await instance.register(plugin, { prefix: '/api/jobs' });
    return instance;
  };

  beforeEach(async () => {
    currentUser = ALICE;
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        enabled INTEGER DEFAULT 1,
        name TEXT,
        blacklist TEXT,
        provider TEXT,
        notification_adapter TEXT,
        shared_with_user TEXT DEFAULT '[]',
        spatial_filter TEXT,
        spec_filter TEXT,
        commute_filter TEXT,
        deal_type TEXT,
        last_run_at INTEGER
      );
      CREATE TABLE configured_adapter (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, adapter_id TEXT NOT NULL, name TEXT NOT NULL,
        fields TEXT NOT NULL DEFAULT '{}', visibility TEXT NOT NULL DEFAULT 'private',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      -- jobStorage.getJob()'s SELECT correlates a listing count against this table.
      CREATE TABLE listings (
        job_id TEXT, is_active INTEGER, manually_deleted INTEGER
      );
    `);
    storage = await import('../../lib/services/storage/configuredAdapterStorage.js');
    app = await build();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  /** Seeds a channel; defaults to one owned by Alice ('u1') and private. */
  const seedChannel = (over = {}) =>
    storage.upsertChannel({
      userId: 'u1',
      adapterId: 'telegram',
      name: 'Family',
      fields: { token: 'tok' },
      visibility: 'private',
      ...over,
    });

  /** A minimal, valid `POST /api/jobs` body; override whatever the test needs to vary. */
  const jobPayload = (over = {}) => ({
    name: 'My job',
    provider: [],
    blacklist: [],
    shareWithUsers: [],
    spatialFilter: null,
    specFilter: null,
    dealType: 'rent',
    notificationAdapter: [],
    ...over,
  });

  const post = (payload) => app.inject({ method: 'POST', url: '/api/jobs', payload });
  const jobCount = () => db.prepare(`SELECT COUNT(1) AS c FROM jobs`).get().c;
  const soleJobRow = () => db.prepare(`SELECT * FROM jobs`).get();

  it('lets the owner of a private channel save a job referencing it, storing exactly the reference shape', async () => {
    const channelId = seedChannel();

    const response = await post(jobPayload({ notificationAdapter: [{ configuredAdapterId: channelId }] }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(soleJobRow().notification_adapter)).toEqual([{ configuredAdapterId: channelId }]);
  });

  // Dedicated regression guard for the failure mode the review flagged: `request.session.currentUser`
  // is a bare id string, used everywhere else in this file for the session. If `canUseChannel` were
  // ever handed that string instead of `request.currentUser` (the resolved object), `user.isAdmin`
  // and `user.id` both read as `undefined` on a plain string, the predicate returns false for every
  // request, and a non-admin could never save a job with a channel of their own - this test goes red
  // in that case.
  it('lets a non-admin owner use their own private channel (guards against passing the bare user id instead of the user object)', async () => {
    const channelId = seedChannel({ userId: 'u1' });
    currentUser = ALICE;

    const response = await post(jobPayload({ notificationAdapter: [{ configuredAdapterId: channelId }] }));

    expect(response.statusCode).toBe(200);
  });

  it('rejects a stranger referencing a private channel, and does not write the job', async () => {
    const channelId = seedChannel({ userId: 'u1', visibility: 'private' });
    currentUser = BOB;

    const response = await post(jobPayload({ notificationAdapter: [{ configuredAdapterId: channelId }] }));

    expect(response.statusCode).toBe(403);
    expect(jobCount()).toBe(0);
  });

  it('rejects a stranger referencing an admin-visibility channel', async () => {
    const channelId = seedChannel({ userId: 'u1', visibility: 'admin' });
    currentUser = BOB;

    const response = await post(jobPayload({ notificationAdapter: [{ configuredAdapterId: channelId }] }));

    expect(response.statusCode).toBe(403);
    expect(jobCount()).toBe(0);
  });

  it('lets a stranger reference an everyone-visibility channel', async () => {
    const channelId = seedChannel({ userId: 'u1', visibility: 'everyone' });
    currentUser = BOB;

    const response = await post(jobPayload({ notificationAdapter: [{ configuredAdapterId: channelId }] }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(soleJobRow().notification_adapter)).toEqual([{ configuredAdapterId: channelId }]);
  });

  it('lets an admin reference anybody else’s private channel', async () => {
    const channelId = seedChannel({ userId: 'u2', visibility: 'private' });
    currentUser = ADMIN;

    const response = await post(jobPayload({ notificationAdapter: [{ configuredAdapterId: channelId }] }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(soleJobRow().notification_adapter)).toEqual([{ configuredAdapterId: channelId }]);
  });

  it('rejects an unknown channel id with 400, and does not write the job', async () => {
    const response = await post(jobPayload({ notificationAdapter: [{ configuredAdapterId: 'does-not-exist' }] }));

    expect(response.statusCode).toBe(400);
    expect(jobCount()).toBe(0);
  });

  it('rejects a [valid, unusable] list with 403 - the loop must not stop at the first element', async () => {
    const validId = seedChannel({ userId: 'u1', visibility: 'private' });
    const unusableId = seedChannel({ userId: 'u2', visibility: 'private' });
    currentUser = ALICE;

    const response = await post(
      jobPayload({
        notificationAdapter: [{ configuredAdapterId: validId }, { configuredAdapterId: unusableId }],
      }),
    );

    expect(response.statusCode).toBe(403);
    expect(jobCount()).toBe(0);
  });

  it('rejects a [valid, unknown] list with 400 - the loop must not stop at the first element', async () => {
    const validId = seedChannel({ userId: 'u1', visibility: 'private' });

    const response = await post(
      jobPayload({
        notificationAdapter: [{ configuredAdapterId: validId }, { configuredAdapterId: 'does-not-exist' }],
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(jobCount()).toBe(0);
  });

  it('collapses duplicate ids across both accepted shapes into a single stored reference', async () => {
    const channelId = seedChannel();

    const response = await post(jobPayload({ notificationAdapter: [channelId, { configuredAdapterId: channelId }] }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(soleJobRow().notification_adapter)).toEqual([{ configuredAdapterId: channelId }]);
  });

  it('stores an empty reference list for the legacy inline shape, rather than creating a channel', async () => {
    const response = await post(jobPayload({ notificationAdapter: [{ id: 'telegram', fields: { token: 'tok' } }] }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(soleJobRow().notification_adapter)).toEqual([]);
    expect(db.prepare(`SELECT COUNT(1) AS c FROM configured_adapter`).get().c).toBe(0);
  });

  it('re-validates on update, rejecting a job that already referenced a channel the resubmitting user may no longer use', async () => {
    // Bob's channel starts out visible to everyone, so Alice may reference it when she first saves.
    const channelId = seedChannel({ userId: 'u2', visibility: 'everyone' });
    const createResponse = await post(jobPayload({ notificationAdapter: [{ configuredAdapterId: channelId }] }));
    expect(createResponse.statusCode).toBe(200);
    const jobId = soleJobRow().id;

    // Bob demotes his channel to private.
    storage.upsertChannel({
      id: channelId,
      userId: 'u2',
      adapterId: 'telegram',
      name: 'Family',
      visibility: 'private',
    });

    // Alice resubmits the same job, still referencing the now-private channel.
    const updateResponse = await post(
      jobPayload({ jobId, name: 'Renamed', notificationAdapter: [{ configuredAdapterId: channelId }] }),
    );

    expect(updateResponse.statusCode).toBe(403);
    expect(soleJobRow().name).not.toBe('Renamed');
  });
});
