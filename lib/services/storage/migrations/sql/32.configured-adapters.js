/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';
import logger from '../../../logger.js';

/**
 * Stable JSON for a field bag, so two configs that differ only in key order are recognised as the
 * same channel. `JSON.stringify` preserves insertion order, and the order in a stored job depends
 * on the order the user happened to fill the form in.
 *
 * @param {Record<string, any>} fields
 * @returns {string}
 */
function stableStringify(fields) {
  const source = fields && typeof fields === 'object' ? fields : {};
  return JSON.stringify(
    Object.keys(source)
      .sort()
      .reduce((acc, key) => {
        acc[key] = source[key];
        return acc;
      }, {}),
  );
}

/**
 * Give each channel a name that is unique per owner.
 *
 * The inline configs only carried the adapter's display name ("Telegram"), which is useless in a
 * list once a user has three of them. The suffix is the minimum that keeps them distinguishable;
 * users are expected to rename them afterwards.
 *
 * @param {Set<string>} taken - Names already used by this owner. Mutated.
 * @param {string} base
 * @returns {string}
 */
function uniqueName(taken, base) {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let counter = 2;
  while (taken.has(`${base} (${counter})`)) counter += 1;
  const name = `${base} (${counter})`;
  taken.add(name);
  return name;
}

/**
 * Move every inline notification adapter configuration into its own row and leave a reference in
 * the job.
 *
 * Everything migrates as `private`, including admin-owned configurations. The `everyone` default
 * applies to channels created from here on: widening access to an existing bot token would be a
 * security change disguised as a data migration.
 *
 * Deduplication is per owner. Two users who happen to have configured the same webhook keep
 * separate rows, so revoking one user's access never touches the other's.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS configured_adapter
    (
      id         TEXT PRIMARY KEY,
      user_id    TEXT    NOT NULL,
      adapter_id TEXT    NOT NULL,
      name       TEXT    NOT NULL,
      fields     TEXT    NOT NULL DEFAULT '{}',
      visibility TEXT    NOT NULL DEFAULT 'private',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_configured_adapter_user ON configured_adapter (user_id);
  `);

  const jobs = db.prepare(`SELECT id, user_id, notification_adapter FROM jobs`).all();
  const insert = db.prepare(
    `INSERT INTO configured_adapter (id, user_id, adapter_id, name, fields, visibility, created_at, updated_at)
     VALUES (@id, @userId, @adapterId, @name, @fields, 'private', @now, @now)`,
  );
  const updateJob = db.prepare(`UPDATE jobs SET notification_adapter = @refs WHERE id = @id`);

  // Load all existing user IDs to detect orphaned jobs. FK enforcement is per connection, so a
  // database restored from backup or touched by tooling without PRAGMA foreign_keys can hold
  // orphans even though the app cannot create them. We skip such jobs to avoid blocking the upgrade.
  const userIds = new Set(
    db
      .prepare(`SELECT id FROM users`)
      .all()
      .map((r) => r.id),
  );

  // key: `${userId}|${adapterId}|${stableFields}` -> channel id
  const byConfig = new Map();
  // owner -> names already handed out
  const namesByUser = new Map();
  const now = Date.now();

  // Pre-seed from rows a previous run created, which is what makes a re-run a no-op.
  for (const row of db.prepare(`SELECT id, user_id, adapter_id, name, fields FROM configured_adapter`).all()) {
    byConfig.set(`${row.user_id}|${row.adapter_id}|${stableStringify(JSON.parse(row.fields))}`, row.id);
    if (!namesByUser.has(row.user_id)) namesByUser.set(row.user_id, new Set());
    namesByUser.get(row.user_id).add(row.name);
  }

  for (const job of jobs) {
    if (!userIds.has(job.user_id)) {
      logger.warn(`Migration 32: skipping job ${job.id} because owner ${job.user_id} does not exist`);
      continue;
    }

    let entries;
    try {
      entries = JSON.parse(job.notification_adapter ?? '[]');
    } catch {
      logger.warn(`Migration 32: job ${job.id} has malformed notification_adapter JSON, treating as empty`);
      entries = [];
    }
    if (!Array.isArray(entries)) entries = [];

    const refs = [];
    for (const entry of entries) {
      if (entry == null || typeof entry !== 'object') continue;

      // Already a reference: a re-run, or a job written by the new code.
      if (typeof entry.configuredAdapterId === 'string' && entry.configuredAdapterId.length > 0) {
        refs.push({ configuredAdapterId: entry.configuredAdapterId });
        continue;
      }
      if (typeof entry.id !== 'string' || entry.id.length === 0) continue;

      const fields = entry.fields && typeof entry.fields === 'object' ? entry.fields : {};
      const key = `${job.user_id}|${entry.id}|${stableStringify(fields)}`;
      let channelId = byConfig.get(key);

      if (channelId == null) {
        if (!namesByUser.has(job.user_id)) namesByUser.set(job.user_id, new Set());
        channelId = nanoid();
        insert.run({
          id: channelId,
          userId: job.user_id,
          adapterId: entry.id,
          name: uniqueName(namesByUser.get(job.user_id), entry.name || entry.id),
          fields: stableStringify(fields),
          now,
        });
        byConfig.set(key, channelId);
      }
      refs.push({ configuredAdapterId: channelId });
    }

    updateJob.run({ id: job.id, refs: JSON.stringify(refs) });
  }
}
