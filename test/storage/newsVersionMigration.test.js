/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up as upNews } from '../../lib/services/storage/migrations/sql/29.news-last-seen-version.js';

/**
 * The migration exists to draw a line under what people have already read.
 *
 * The versioned What's New decides what to show somebody by comparing against the newest release
 * they have been shown. On the first start after an upgrade nobody has that recorded, so without
 * this every existing user would be greeted with the backlog of every release note they have
 * already dismissed - the exact opposite of the point.
 */
describe('migration 29 - the news marker', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT
      );
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

  const addUser = (id) => db.prepare(`INSERT INTO users (id, username) VALUES (?, ?)`).run(id, id);
  const settingFor = (name, userId) =>
    db.prepare(`SELECT value FROM settings WHERE name = ? AND user_id = ?`).get(name, userId)?.value;
  const rowCount = (name) => db.prepare(`SELECT COUNT(1) AS n FROM settings WHERE name = ?`).get(name).n;

  it('marks every existing user as caught up', () => {
    addUser('a');
    addUser('b');
    upNews(db);
    expect(JSON.parse(settingFor('news_last_seen_version', 'a'))).toBe('25.0.0');
    expect(JSON.parse(settingFor('news_last_seen_version', 'b'))).toBe('25.0.0');
  });

  it('leaves a marker somebody already has alone', () => {
    addUser('a');
    db.prepare(
      `INSERT INTO settings (id, create_date, name, value, user_id) VALUES ('x', 1, 'news_last_seen_version', '"1.0.0"', 'a')`,
    ).run();
    upNews(db);
    expect(JSON.parse(settingFor('news_last_seen_version', 'a'))).toBe('1.0.0');
    expect(rowCount('news_last_seen_version')).toBe(1);
  });

  it('leaves the old news_hash rows in place, so a downgrade forgets nothing', () => {
    addUser('a');
    db.prepare(
      `INSERT INTO settings (id, create_date, name, value, user_id) VALUES ('h', 1, 'news_hash', '"abc"', 'a')`,
    ).run();
    upNews(db);
    expect(settingFor('news_hash', 'a')).toBe('"abc"');
  });

  it('writes nothing on an instance with no users yet', () => {
    upNews(db);
    expect(rowCount('news_last_seen_version')).toBe(0);
  });

  it('gives a user created afterwards no marker, which is how a new account is recognised', () => {
    addUser('existing');
    upNews(db);
    addUser('joinedLater');
    expect(settingFor('news_last_seen_version', 'existing')).toBeDefined();
    expect(settingFor('news_last_seen_version', 'joinedLater')).toBeUndefined();
  });
});
