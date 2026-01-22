/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { markdown2Html } from '../../services/markdown.js';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export const send = ({ serviceName, newListings, jobKey, notificationConfig }) => {
  const sqliteConfig = notificationConfig.find((adapter) => adapter.id === config.id);
  const dbPath = sqliteConfig?.fields?.dbPath || 'db/listings.db';

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
