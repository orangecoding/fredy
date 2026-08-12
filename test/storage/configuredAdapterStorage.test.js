/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params = {}) => db.prepare(sql).all(params),
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    withTransaction: (cb) => db.transaction(() => cb(db))(),
  },
}));

describe('configuredAdapterStorage', () => {
  let storage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, notification_adapter TEXT);
      CREATE TABLE configured_adapter (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, adapter_id TEXT NOT NULL, name TEXT NOT NULL,
        fields TEXT NOT NULL DEFAULT '{}', visibility TEXT NOT NULL DEFAULT 'private',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
    `);
    storage = await import('../../lib/services/storage/configuredAdapterStorage.js');
  });

  afterEach(() => db.close());

  const addJob = (id, refs) =>
    db
      .prepare(`INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES (?, 'u1', ?, ?)`)
      .run(id, `job ${id}`, JSON.stringify(refs));

  it('round-trips a channel', () => {
    const id = storage.upsertChannel({
      userId: 'u1',
      adapterId: 'telegram',
      name: 'Family',
      fields: { token: 'tok' },
      visibility: storage.VISIBILITY.EVERYONE,
    });

    expect(storage.getChannel(id)).toMatchObject({
      id,
      userId: 'u1',
      adapterId: 'telegram',
      name: 'Family',
      fields: { token: 'tok' },
      visibility: 'everyone',
    });
  });

  it('updates in place without changing the owner or the id', () => {
    const id = storage.upsertChannel({ userId: 'u1', adapterId: 'telegram', name: 'Family', fields: {} });
    const same = storage.upsertChannel({
      id,
      userId: 'someone-else',
      adapterId: 'slack',
      name: 'Renamed',
      fields: { token: 'x' },
    });

    expect(same).toBe(id);
    const channel = storage.getChannel(id);
    expect(channel.userId).toBe('u1');
    // The adapter type is fixed at creation - changing it would orphan the stored fields.
    expect(channel.adapterId).toBe('telegram');
    expect(channel.name).toBe('Renamed');
  });

  it('returns null for a channel that does not exist', () => {
    expect(storage.getChannel('nope')).toBeNull();
  });

  it('finds the jobs referencing a channel', () => {
    const id = storage.upsertChannel({ userId: 'u1', adapterId: 'telegram', name: 'Family', fields: {} });
    addJob('j1', [{ configuredAdapterId: id }]);
    addJob('j2', [{ configuredAdapterId: id }]);
    addJob('j3', [{ configuredAdapterId: 'other' }]);

    expect(
      storage
        .getJobsUsingChannel(id)
        .map((j) => j.id)
        .sort(),
    ).toEqual(['j1', 'j2']);
  });

  it('counts usage for every channel in one pass', () => {
    const a = storage.upsertChannel({ userId: 'u1', adapterId: 'telegram', name: 'A', fields: {} });
    const b = storage.upsertChannel({ userId: 'u1', adapterId: 'slack', name: 'B', fields: {} });
    addJob('j1', [{ configuredAdapterId: a }, { configuredAdapterId: b }]);
    addJob('j2', [{ configuredAdapterId: a }]);

    const counts = storage.getUsageCounts();
    expect(counts.get(a)).toBe(2);
    expect(counts.get(b)).toBe(1);
    expect(counts.get('unused')).toBeUndefined();
  });

  it('handles malformed JSON and non-object array elements gracefully', () => {
    const a = storage.upsertChannel({ userId: 'u1', adapterId: 'telegram', name: 'A', fields: {} });
    const realId = storage.upsertChannel({ userId: 'u1', adapterId: 'slack', name: 'B', fields: {} });

    // Insert jobs with various problematic notification_adapter values
    // Malformed column values
    db.prepare(
      `INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES ('j_null', 'u1', 'null job', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES ('j_empty_arr', 'u1', 'empty array', '[]')`,
    ).run();
    db.prepare(
      `INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES ('j_obj_not_arr', 'u1', 'object not array', '{"configuredAdapterId":"a"}')`,
    ).run();
    db.prepare(
      `INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES ('j_invalid_json', 'u1', 'invalid json', 'not valid json')`,
    ).run();

    // Arrays with non-object elements that must be skipped
    db.prepare(
      `INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES ('j_arr_string', 'u1', 'array of string', '["bare string"]')`,
    ).run();
    db.prepare(
      `INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES ('j_arr_number', 'u1', 'array of number', '[123]')`,
    ).run();
    db.prepare(
      `INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES ('j_arr_null', 'u1', 'array of null', '[null]')`,
    ).run();

    // Mixed arrays where only object elements should be extracted
    db.prepare(`INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES (?, 'u1', ?, ?)`).run(
      'j_mixed',
      'mixed array',
      JSON.stringify([{ configuredAdapterId: realId }, 'bare string']),
    );

    // Well-formed array with valid object
    db.prepare(`INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES (?, 'u1', ?, ?)`).run(
      'j_valid',
      'valid job',
      JSON.stringify([{ configuredAdapterId: realId }]),
    );

    // getUsageCounts must not throw and must count only valid objects
    const counts = storage.getUsageCounts();
    expect(counts.get(realId)).toBe(2); // j_mixed and j_valid
    expect(counts.get(a)).toBeUndefined();

    // getJobsUsingChannel must not throw and must return both jobs with valid refs
    const jobsUsing = storage
      .getJobsUsingChannel(realId)
      .map((j) => j.id)
      .sort();
    expect(jobsUsing).toEqual(['j_mixed', 'j_valid']);
  });

  it('removes a channel', () => {
    const id = storage.upsertChannel({ userId: 'u1', adapterId: 'telegram', name: 'A', fields: {} });
    storage.removeChannel(id);
    expect(storage.getChannel(id)).toBeNull();
  });

  it('defaults visibility to private', () => {
    const id = storage.upsertChannel({ userId: 'u1', adapterId: 'telegram', name: 'A', fields: {} });
    expect(storage.getChannel(id).visibility).toBe('private');
  });

  it('rejects an unknown visibility rather than storing it', () => {
    const id = storage.upsertChannel({
      userId: 'u1',
      adapterId: 'telegram',
      name: 'A',
      fields: {},
      visibility: 'world',
    });
    expect(storage.getChannel(id).visibility).toBe('private');
  });

  it('normaliseVisibility coerces null to private', () => {
    const id = storage.upsertChannel({
      userId: 'u1',
      adapterId: 'telegram',
      name: 'A',
      fields: {},
      visibility: null,
    });
    expect(storage.getChannel(id).visibility).toBe('private');
  });

  it('normaliseVisibility coerces undefined to private', () => {
    const id = storage.upsertChannel({
      userId: 'u1',
      adapterId: 'telegram',
      name: 'A',
      fields: {},
      visibility: undefined,
    });
    expect(storage.getChannel(id).visibility).toBe('private');
  });

  it('normaliseVisibility coerces a number to private', () => {
    const id = storage.upsertChannel({
      userId: 'u1',
      adapterId: 'telegram',
      name: 'A',
      fields: {},
      visibility: 42,
    });
    expect(storage.getChannel(id).visibility).toBe('private');
  });

  it('normaliseVisibility rejects wrong-case visibility strings', () => {
    const id = storage.upsertChannel({
      userId: 'u1',
      adapterId: 'telegram',
      name: 'A',
      fields: {},
      visibility: 'PRIVATE',
    });
    expect(storage.getChannel(id).visibility).toBe('private');
  });
});
