/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The duplicate check behind adding a listing by URL. "Already in Fredy" has to mean "already in
 * front of this user": an advert another user's job found is no reason to refuse it, and one in a
 * job shared with this user is.
 */
describe('getListingsByLinkForUser', () => {
  let db;
  let listingsStorage;

  const LINK = 'https://www.immobilienscout24.de/expose/1';

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, shared_with_user TEXT DEFAULT '[]');
      CREATE TABLE listings (
        id TEXT PRIMARY KEY, job_id TEXT, provider TEXT, link TEXT,
        manually_deleted INTEGER DEFAULT 0, created_at INTEGER
      );
    `);
    db.exec(`
      INSERT INTO jobs VALUES ('own', 'user-1', 'Berlin', '[]');
      INSERT INTO jobs VALUES ('shared', 'user-2', 'Shared', '["user-1"]');
      INSERT INTO jobs VALUES ('foreign', 'user-3', 'Foreign', '[]');
      INSERT INTO jobs VALUES ('target', 'user-3', 'Target', '[]');
    `);

    vi.resetModules();
    vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params),
        execute: (sql, params) => db.prepare(sql).run(params),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    vi.doMock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  const insert = (id, jobId, { provider = 'immoscout', link = LINK, deleted = 0, createdAt = 1 } = {}) =>
    db
      .prepare(`INSERT INTO listings (id, job_id, provider, link, manually_deleted, created_at) VALUES (?,?,?,?,?,?)`)
      .run(id, jobId, provider, link, deleted, createdAt);

  const ids = (jobId = 'own') =>
    listingsStorage.getListingsByLinkForUser('immoscout', LINK, 'user-1', jobId).map((r) => r.id);

  it('finds the advert in an own job and in one shared with the user, with the job name', () => {
    insert('a', 'own');
    insert('b', 'shared');
    const rows = listingsStorage.getListingsByLinkForUser('immoscout', LINK, 'user-1', 'own');

    expect(rows.map((row) => [row.id, row.job_name])).toEqual([
      ['a', 'Berlin'],
      ['b', 'Shared'],
    ]);
  });

  it("ignores another user's job unless it is the one being added to", () => {
    insert('c', 'foreign');
    insert('d', 'target');

    expect(ids('own')).toEqual([]);
    expect(ids('target')).toEqual(['d']);
  });

  it('puts the target job first, deleted rows included', () => {
    insert('elsewhere', 'shared', { createdAt: 5 });
    insert('here', 'own', { deleted: 1, createdAt: 1 });

    expect(ids('own')).toEqual(['here', 'elsewhere']);
  });

  it('matches provider and link exactly', () => {
    insert('other-provider', 'own', { provider: 'immowelt' });
    insert('other-link', 'own', { link: `${LINK}?ref=share` });

    expect(ids()).toEqual([]);
  });
});
