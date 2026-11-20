/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { up as addDraftColumns } from '../../lib/services/storage/migrations/sql/61.application-drafts.js';

describe('setApplicationDraft', () => {
  let db;
  let listingsStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE listings (id TEXT PRIMARY KEY, job_id TEXT)`);
    db.exec(`CREATE TABLE jobs (id TEXT PRIMARY KEY)`);
    addDraftColumns(db);
    db.prepare(`INSERT INTO listings (id) VALUES (?)`).run('listing-1');

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

  const row = () =>
    db
      .prepare(
        `SELECT application_draft, application_draft_generated_at, application_draft_model FROM listings WHERE id = ?`,
      )
      .get('listing-1');

  it('stores the draft with its time and model', () => {
    const changes = listingsStorage.setApplicationDraft('listing-1', {
      text: 'Guten Tag',
      generatedAt: 1700000000000,
      model: 'gpt-test',
    });

    expect(changes).toBe(1);
    expect(row()).toEqual({
      application_draft: 'Guten Tag',
      application_draft_generated_at: 1700000000000,
      application_draft_model: 'gpt-test',
    });
  });

  it('refuses a blank draft rather than store one that reads as written', () => {
    expect(listingsStorage.setApplicationDraft('listing-1', { text: '   ' })).toBe(0);
    expect(listingsStorage.setApplicationDraft('listing-1', null)).toBe(0);
    expect(row().application_draft).toBeNull();
  });

  it('reports 0 for a listing that does not exist', () => {
    expect(listingsStorage.setApplicationDraft('missing', { text: 'Hallo' })).toBe(0);
  });

  it('fills in the time and leaves an empty model unset', () => {
    listingsStorage.setApplicationDraft('listing-1', { text: 'Hallo', model: ' ' });

    expect(Number.isFinite(row().application_draft_generated_at)).toBe(true);
    expect(row().application_draft_model).toBeNull();
  });
});
