/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const MIGRATIONS_DIR = path.resolve('lib/services/storage/migrations/sql');

/**
 * The production schema, in memory: every migration run in order against a fresh database.
 *
 * For tests that want real storage behind the code they exercise, which is where a rule that two
 * callers share is best checked - no stand-in to disagree with the schema.
 *
 * @returns {Promise<import('better-sqlite3').Database>}
 */
export async function migratedDatabase() {
  const database = new Database(':memory:');
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, id: Number(file.split('.')[0]) }))
    .sort((a, b) => (a.id === b.id ? a.file.localeCompare(b.file) : a.id - b.id));
  for (const { file } of files) {
    const migration = await import(pathToFileURL(path.join(MIGRATIONS_DIR, file)).href);
    await (migration.up ?? migration.default)(database);
  }
  return database;
}

/**
 * What `SqliteConnection.js` exports, backed by the given database. Hand it to `vi.doMock`.
 *
 * @param {() => import('better-sqlite3').Database} current - Read per call, so a test can swap the
 *   database in `beforeEach` without mocking again.
 * @returns {{default: object}}
 */
export function sqliteConnectionFor(current) {
  return {
    default: {
      getConnection: () => current(),
      query: (sql, params = {}) => current().prepare(sql).all(params),
      execute: (sql, params = {}) => current().prepare(sql).run(params),
      withTransaction: (callback) => current().transaction(() => callback(current()))(),
    },
  };
}
