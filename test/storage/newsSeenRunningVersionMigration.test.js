/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/53.news-seen-running-version.js';

/**
 * The marker was last written from news.json, which stopped at 29.1.0. Without this migration every
 * existing user would be shown the notes of a version they already run.
 */
describe('migration 53 - news seen up to the running version', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY)`);
    db.exec(`CREATE TABLE settings (id TEXT PRIMARY KEY, create_date INTEGER, name TEXT, value TEXT, user_id TEXT)`);
    db.prepare(`INSERT INTO users (id) VALUES (?)`).run('user-1');
  });

  afterEach(() => db.close());

  const markerOf = (userId) => {
    const rows = db
      .prepare(`SELECT value FROM settings WHERE name = 'news_last_seen_version' AND user_id = ?`)
      .all(userId);
    return rows.map((row) => JSON.parse(row.value));
  };

  const storeMarker = (userId, version) =>
    db
      .prepare(
        `INSERT INTO settings (id, create_date, name, value, user_id) VALUES (?, 0, 'news_last_seen_version', ?, ?)`,
      )
      .run(`${userId}-marker`, JSON.stringify(version), userId);

  it('moves a marker left behind by news.json up to the running version', () => {
    storeMarker('user-1', '29.1.0');
    up(db, '30.1.1');
    expect(markerOf('user-1')).toEqual(['30.1.1']);
  });

  it('gives a user without a marker one, so nothing is shown until the next upgrade', () => {
    up(db, '30.1.1');
    expect(markerOf('user-1')).toEqual(['30.1.1']);
  });

  it('leaves a marker that is already newer alone', () => {
    storeMarker('user-1', '31.0.0');
    up(db, '30.1.1');
    expect(markerOf('user-1')).toEqual(['31.0.0']);
  });

  it('changes nothing when the running version cannot be read', () => {
    storeMarker('user-1', '29.1.0');
    up(db, null);
    up(db, 'N/A');
    expect(markerOf('user-1')).toEqual(['29.1.0']);
  });

  it('takes the running version from package.json by default', () => {
    const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    up(db);
    expect(markerOf('user-1')).toEqual([version]);
  });
});
