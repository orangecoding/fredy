/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/47.onboarding-tour.js';

/**
 * The tour is offered to accounts without a marker. The migration is what makes "without a marker"
 * mean "new here": without it, every account on an upgraded instance would be offered an
 * introduction to a product it has been using all along.
 */
describe('migration 47 - the onboarding tour marker', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
      CREATE TABLE settings (id TEXT PRIMARY KEY, create_date INTEGER, name TEXT, value TEXT, user_id TEXT);
    `);
  });

  afterEach(() => db.close());

  const addUser = (id) => db.prepare(`INSERT INTO users (id, username) VALUES (?, ?)`).run(id, id);
  const markerOf = (userId) =>
    db.prepare(`SELECT value FROM settings WHERE name = 'onboarding_tour' AND user_id = ?`).get(userId)?.value;

  it('marks every existing account as not needing the tour', () => {
    addUser('a');
    addUser('b');
    up(db);
    expect(JSON.parse(markerOf('a'))).toEqual({ status: 'preexisting' });
    expect(JSON.parse(markerOf('b'))).toEqual({ status: 'preexisting' });
  });

  it('leaves an account that already has a marker alone', () => {
    addUser('a');
    db.prepare(
      `INSERT INTO settings (id, create_date, name, value, user_id) VALUES ('x', 1, 'onboarding_tour', '{"status":"completed"}', 'a')`,
    ).run();
    up(db);
    expect(JSON.parse(markerOf('a'))).toEqual({ status: 'completed' });
    expect(db.prepare(`SELECT COUNT(1) AS n FROM settings`).get().n).toBe(1);
  });

  it('writes nothing on a fresh install, so the first administrator is offered the tour', () => {
    up(db);
    expect(db.prepare(`SELECT COUNT(1) AS n FROM settings`).get().n).toBe(0);
  });
});
