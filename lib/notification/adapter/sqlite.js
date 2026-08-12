/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readAdapterReadme } from '../../services/markdown.js';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { computeDbPath } from '../../services/storage/SqliteConnection.js';
import { toPriceChangeListing } from '../priceChangeMessage.js';

/**
 * Resolve the configured database path, refusing anything outside Fredy's own database directory.
 *
 * This adapter opens (and creates) whatever file it is pointed at. Only admins can configure the
 * field, but "admin" is not the same as "may write anywhere on the host", and a typo or a pasted
 * path is enough to have Fredy create a database somewhere it does not belong. Containing it to the
 * configured sqlite directory keeps the adapter useful - the point is a second database next to the
 * main one - without handing out a filesystem primitive.
 *
 * @param {string|undefined|null} configuredPath - Raw value from the adapter config.
 * @returns {Promise<string>} Absolute path inside the sqlite directory.
 * @throws {Error} When the configured path resolves outside the sqlite directory.
 */
export async function resolveDbPath(configuredPath) {
  const { dir } = await computeDbPath();
  const raw =
    configuredPath && String(configuredPath).trim().length > 0 ? String(configuredPath).trim() : 'listings.db';
  const resolved = path.resolve(dir, raw);
  const withinDir = resolved === dir || resolved.startsWith(dir + path.sep);
  if (!withinDir) {
    throw new Error(`The SQLite notification adapter may only write inside "${dir}". Got "${resolved}".`);
  }
  return resolved;
}

export const send = async ({ serviceName, newListings, jobKey, notificationConfig }) => {
  const sqliteConfig = notificationConfig.find((adapter) => adapter.id === config.id);
  const dbPath = await resolveDbPath(sqliteConfig?.fields?.dbPath);

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
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS listing (${fields.join(' TEXT, ')} TEXT);`).run();
    const insert = db.prepare(`INSERT INTO listing (${fields.join(', ')}) VALUES (@${fields.join(', @')})`);
    for (const listing of newListings) {
      const insertListing = {};
      for (const field of fields) {
        insertListing[field] = listing[field];
      }
      insertListing.serviceName = serviceName;
      insertListing.jobKey = jobKey;
      insert.run(insertListing);
    }
  } finally {
    // Every send opens its own handle; without this a long-running instance accumulates one open
    // file descriptor per notification.
    db.close();
  }
};
/**
 * Append price changes to a `price_change` table beside the `listing` one.
 *
 * A separate table rather than extra columns on `listing`: that table is an append-only log of
 * "Fredy told me about this", and a price change is a different event with different columns. Users
 * querying it for new listings should not have to learn to exclude rows that are not.
 *
 * @param {{serviceName: string, priceChanges: any[], jobKey: string, notificationConfig: any[]}} params
 * @returns {Promise<void>}
 */
export const sendPriceChange = async ({ serviceName, priceChanges, jobKey, notificationConfig }) => {
  const sqliteConfig = notificationConfig.find((adapter) => adapter.id === config.id);
  const dbPath = await resolveDbPath(sqliteConfig?.fields?.dbPath);

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  const fields = [
    'serviceName',
    'jobKey',
    'id',
    'title',
    'address',
    'link',
    'oldPrice',
    'newPrice',
    'changePercent',
    'direction',
    'observedAt',
  ];
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS price_change (${fields.join(' TEXT, ')} TEXT);`).run();
    const insert = db.prepare(`INSERT INTO price_change (${fields.join(', ')}) VALUES (@${fields.join(', @')})`);
    const observedAt = new Date().toISOString();
    for (const change of priceChanges) {
      const listing = toPriceChangeListing(change);
      insert.run({
        serviceName,
        jobKey,
        id: listing.id ?? null,
        title: change.title ?? null,
        address: change.address ?? null,
        link: change.link ?? null,
        oldPrice: change.oldPrice ?? null,
        newPrice: change.newPrice ?? null,
        changePercent: change.changePercent ?? null,
        direction: change.direction ?? null,
        observedAt,
      });
    }
  } finally {
    // Every send opens its own handle; without this a long-running instance accumulates one open
    // file descriptor per notification.
    db.close();
  }
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
        'File name of the SQLite database, relative to Fredy\'s configured database directory (e.g. "notifications.db"). Paths outside that directory are rejected. Defaults to listings.db.',
      placeholder: 'listings.db',
      // Shown as the channel's destination in the UI.
      target: true,
    },
  },
  readme: readAdapterReadme('sqlite.md'),
};
