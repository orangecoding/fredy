/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/34.working-hours-timezone.js';
import { getProcessTimeZone } from '../../lib/utils.js';

/**
 * The migration decides what an already-configured window means after the upgrade. Writing the
 * wrong zone here would move every operator's search hours without them touching anything, so what
 * is guarded is that the recorded zone is the one the old code was already evaluating in - and that
 * configurations with nothing to pin are left alone.
 */
describe('migration 34 - working hours time zone', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE settings (
        id TEXT PRIMARY KEY,
        create_date INTEGER,
        name TEXT,
        value TEXT,
        user_id TEXT
      );
    `);
  });

  afterEach(() => db.close());

  const storeWorkingHours = (value) =>
    db
      .prepare(`INSERT INTO settings (id, create_date, name, value) VALUES (?,?,?,?)`)
      .run('setting-1', Date.now(), 'workingHours', value);

  const readWorkingHours = () =>
    JSON.parse(db.prepare(`SELECT value FROM settings WHERE name = 'workingHours'`).get().value);

  it('pins a configured window to the zone it was already being read in', () => {
    storeWorkingHours(JSON.stringify({ from: '10:00', to: '16:00' }));

    up(db);

    expect(readWorkingHours()).toEqual({ from: '10:00', to: '16:00', timeZone: getProcessTimeZone() });
  });

  it('leaves a window that already names a zone untouched', () => {
    storeWorkingHours(JSON.stringify({ from: '10:00', to: '16:00', timeZone: 'Asia/Tokyo' }));

    up(db);

    expect(readWorkingHours().timeZone).toBe('Asia/Tokyo');
  });

  it('does not put a zone in front of an operator who has no window set', () => {
    storeWorkingHours(JSON.stringify({ from: '', to: '' }));

    up(db);

    expect(readWorkingHours()).toEqual({ from: '', to: '' });
  });

  it('leaves a half-configured window alone', () => {
    // Only one edge set means the scheduler ignores the window entirely, so there is nothing to pin.
    storeWorkingHours(JSON.stringify({ from: '10:00', to: null }));

    up(db);

    expect(readWorkingHours()).toEqual({ from: '10:00', to: null });
  });

  it('writes a zone that the runtime can actually resolve', () => {
    storeWorkingHours(JSON.stringify({ from: '10:00', to: '16:00' }));

    up(db);

    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: readWorkingHours().timeZone })).not.toThrow();
  });

  it('is a no-op when there is no working hours row at all', () => {
    expect(() => up(db)).not.toThrow();
    expect(db.prepare(`SELECT COUNT(*) AS count FROM settings`).get().count).toBe(0);
  });

  it('survives a value that is not JSON instead of blocking later migrations', () => {
    storeWorkingHours('not json at all');

    expect(() => up(db)).not.toThrow();
  });

  it('is a no-op on an instance that has no settings table yet', () => {
    const empty = new Database(':memory:');
    try {
      expect(() => up(empty)).not.toThrow();
    } finally {
      empty.close();
    }
  });

  it('can be applied twice without changing the result', () => {
    storeWorkingHours(JSON.stringify({ from: '10:00', to: '16:00' }));

    up(db);
    const afterFirst = readWorkingHours();
    up(db);

    expect(readWorkingHours()).toEqual(afterFirst);
  });
});
