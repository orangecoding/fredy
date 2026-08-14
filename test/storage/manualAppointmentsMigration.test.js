/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { up } from '../../lib/services/storage/migrations/sql/35.manual-appointments.js';

describe('migration 35 - manual appointments', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE listings (id TEXT PRIMARY KEY);
      INSERT INTO users (id) VALUES ('u1');
      INSERT INTO listings (id) VALUES ('l1');
    `);
    up(db);
  });

  afterEach(() => db.close());

  it('creates one manual appointment per user and listing', () => {
    db.prepare(
      `
      INSERT INTO manual_appointments
        (id, listing_id, user_id, starts_at, created_at, updated_at)
      VALUES ('a1', 'l1', 'u1', 1000, 1, 1)
    `,
    ).run();

    expect(() =>
      db
        .prepare(
          `
        INSERT INTO manual_appointments
          (id, listing_id, user_id, starts_at, created_at, updated_at)
        VALUES ('a2', 'l1', 'u1', 2000, 2, 2)
      `,
        )
        .run(),
    ).toThrow();
  });

  it('removes an appointment when its listing is deleted', () => {
    db.prepare(
      `
      INSERT INTO manual_appointments
        (id, listing_id, user_id, starts_at, created_at, updated_at)
      VALUES ('a1', 'l1', 'u1', 1000, 1, 1)
    `,
    ).run();
    db.prepare(`DELETE FROM listings WHERE id = 'l1'`).run();
    expect(db.prepare(`SELECT COUNT(*) AS count FROM manual_appointments`).get().count).toBe(0);
  });
});
