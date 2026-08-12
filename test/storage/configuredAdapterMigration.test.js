/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/32.configured-adapters.js';

/**
 * The migration runs against a raw better-sqlite3 handle, so the test builds the minimal
 * users/jobs schema in memory and asserts on the rewritten rows directly.
 */
describe('migration 32 - configured notification channels', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
      CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, notification_adapter TEXT);
    `);
    db.prepare(`INSERT INTO users (id, username) VALUES ('u1', 'alice'), ('u2', 'bob')`).run();
  });

  afterEach(() => db.close());

  const addJob = (id, userId, adapters) =>
    db
      .prepare(`INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES (?, ?, ?, ?)`)
      .run(id, userId, `job ${id}`, JSON.stringify(adapters));

  const refsOf = (jobId) =>
    JSON.parse(db.prepare(`SELECT notification_adapter FROM jobs WHERE id = ?`).get(jobId).notification_adapter);

  const channels = () => db.prepare(`SELECT * FROM configured_adapter ORDER BY name`).all();

  const telegram = (token, chatId) => ({ id: 'telegram', name: 'Telegram', fields: { token, chatId } });

  it('creates the table', () => {
    up(db);
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((r) => r.name);
    expect(names).toContain('configured_adapter');
  });

  it('moves an inline config into a channel and leaves a reference behind', () => {
    addJob('j1', 'u1', [telegram('tok', '123')]);
    up(db);

    const all = channels();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ user_id: 'u1', adapter_id: 'telegram', name: 'Telegram' });
    expect(JSON.parse(all[0].fields)).toEqual({ token: 'tok', chatId: '123' });

    expect(refsOf('j1')).toEqual([{ configuredAdapterId: all[0].id }]);
  });

  it('shares one channel between two jobs with an identical config', () => {
    addJob('j1', 'u1', [telegram('tok', '123')]);
    addJob('j2', 'u1', [telegram('tok', '123')]);
    up(db);

    expect(channels()).toHaveLength(1);
    expect(refsOf('j1')).toEqual(refsOf('j2'));
  });

  it('keeps configs apart when a field differs, and disambiguates the name', () => {
    addJob('j1', 'u1', [telegram('tok', '123')]);
    addJob('j2', 'u1', [telegram('tok', '999')]);
    up(db);

    const all = channels();
    expect(all).toHaveLength(2);
    expect(all.map((c) => c.name)).toEqual(['Telegram', 'Telegram (2)']);
    expect(refsOf('j1')).not.toEqual(refsOf('j2'));
  });

  it('does not share a config between two different owners', () => {
    addJob('j1', 'u1', [telegram('tok', '123')]);
    addJob('j2', 'u2', [telegram('tok', '123')]);
    up(db);

    const all = channels();
    expect(all).toHaveLength(2);
    expect(all.map((c) => c.user_id).sort()).toEqual(['u1', 'u2']);
  });

  it('migrates everything as private, never as everyone', () => {
    addJob('j1', 'u1', [telegram('tok', '123')]);
    up(db);
    expect(channels().every((c) => c.visibility === 'private')).toBe(true);
  });

  it('ignores field order when deciding two configs are the same', () => {
    addJob('j1', 'u1', [{ id: 'telegram', name: 'Telegram', fields: { token: 'tok', chatId: '1' } }]);
    addJob('j2', 'u1', [{ id: 'telegram', name: 'Telegram', fields: { chatId: '1', token: 'tok' } }]);
    up(db);
    expect(channels()).toHaveLength(1);
  });

  it('is idempotent - a second run changes nothing', () => {
    addJob('j1', 'u1', [telegram('tok', '123')]);
    up(db);
    const before = channels();
    const refsBefore = refsOf('j1');

    up(db);
    expect(channels()).toEqual(before);
    expect(refsOf('j1')).toEqual(refsBefore);
  });

  it('survives a job with no adapters at all', () => {
    addJob('j1', 'u1', []);
    db.prepare(`INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES ('j2', 'u1', 'j2', NULL)`).run();
    up(db);
    expect(channels()).toHaveLength(0);
    expect(refsOf('j1')).toEqual([]);
  });

  it('drops an entry that carries no adapter id', () => {
    addJob('j1', 'u1', [{ name: 'broken', fields: {} }]);
    up(db);
    expect(channels()).toHaveLength(0);
    expect(refsOf('j1')).toEqual([]);
  });

  it('skips a job whose user_id does not exist in users table', () => {
    addJob('j1', 'u1', [telegram('tok', '123')]);
    db.prepare(`INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES (?, ?, ?, ?)`).run(
      'j2',
      'u-missing',
      'job j2',
      JSON.stringify([telegram('tok', '456')]),
    );
    up(db);

    const all = channels();
    expect(all).toHaveLength(1);
    expect(all[0].user_id).toBe('u1');
    expect(refsOf('j1')).toHaveLength(1);
    expect(refsOf('j2')).toEqual([{ id: 'telegram', name: 'Telegram', fields: { token: 'tok', chatId: '456' } }]);
  });

  it('handles genuinely invalid JSON in notification_adapter', () => {
    addJob('j1', 'u1', [telegram('tok', '123')]);
    db.prepare(`INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES (?, ?, ?, ?)`).run(
      'j2',
      'u1',
      'job j2',
      '{not json',
    );
    up(db);

    expect(channels()).toHaveLength(1);
    expect(refsOf('j1')).toHaveLength(1);
    expect(refsOf('j2')).toEqual([]);
  });
});
