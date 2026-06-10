/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { markdown2Html } from '../../services/markdown.js';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * Resolve and validate the user-supplied dbPath so that the resulting file
 * always lives under the application's working directory.  This prevents
 * path-traversal attacks (CWE-22) where a crafted dbPath such as
 * "../../../../etc/cron.d/evil" could create or overwrite arbitrary files.
 *
 * Rules:
 *  1. Absolute paths are rejected outright.
 *  2. The resolved path must reside within `process.cwd()`.
 *  3. The filename must end with `.db`.
 *
 * @param {string} raw  The user-supplied database path.
 * @returns {string}     A safe, resolved absolute path.
 * @throws {Error}       When the path is invalid or escapes the project root.
 */
function safeDatabasePath(raw) {
  if (path.isAbsolute(raw)) {
    throw new Error(`Absolute database paths are not allowed: ${raw}`);
  }

  const resolved = path.resolve(process.cwd(), raw);
  const root = process.cwd() + path.sep;

  if (!resolved.startsWith(root) && resolved !== process.cwd()) {
    throw new Error(`Database path must be within the application directory: ${raw}`);
  }

  if (!resolved.endsWith('.db')) {
    throw new Error(`Database path must end with .db: ${raw}`);
  }

  return resolved;
}

export const send = ({ serviceName, newListings, jobKey, notificationConfig }) => {
  const sqliteConfig = notificationConfig.find((adapter) => adapter.id === config.id);
  const rawPath = sqliteConfig?.fields?.dbPath || 'db/listings.db';
  const dbPath = safeDatabasePath(rawPath);

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  const fields = [
    'serviceName',
    'jobKey',
    'id',
    'size',
    'rooms',
    'price',
    'address',
    'title',
    'link',
    'description',
    'image',
  ];
  db.prepare(`CREATE TABLE IF NOT EXISTS listing (${fields.join(' TEXT, ')} TEXT);`).run();
  const insert = db.prepare(`INSERT INTO listing (${fields.join(', ')}) VALUES (@${fields.join(', @')})`);
  newListings.map((listing) => {
    let insertListing = {};
    fields.map((field) => {
      insertListing[field] = listing[field];
    });
    insertListing.serviceName = serviceName;
    insertListing.jobKey = jobKey;
    insert.run(insertListing);
  });
  return Promise.resolve();
};
export const config = {
  id: 'sqlite',
  name: 'SQLite',
  description: 'This adapter stores listings in a local SQLite 3 database.',
  fields: {
    dbPath: {
      type: 'text',
      label: 'Database Path',
      description:
        'Path to the SQLite database file (e.g., db/listings.db). If not specified, defaults to db/listings.db',
      placeholder: 'db/listings.db',
    },
  },
  readme: markdown2Html('lib/notification/adapter/sqlite.md'),
};

export { safeDatabasePath };
