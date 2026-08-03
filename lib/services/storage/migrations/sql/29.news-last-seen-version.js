/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';

/**
 * The version everyone who is already using this instance is treated as having seen.
 *
 * Hard-coded rather than read from package.json: this migration has one job, which is to draw a
 * line under the news that existed when the versioned What's New shipped. Reading the running
 * version would make the line move depending on when someone happened to upgrade, and a user who
 * skipped from 24 to 26 would be told nothing about 25.
 * @type {string}
 */
const NEWS_BASELINE_VERSION = '25.0.0';

/**
 * Give every existing user a "last seen" marker for the news.
 *
 * The old mechanism stored `news_hash`, a hash of whatever news.json held at the time. It could
 * only answer "did you dismiss this exact payload", so skipping a release meant its news was never
 * shown at all. The replacement stores a version, which answers "what have you been told about"
 * and therefore survives an upgrade that spans several releases.
 *
 * Everyone who exists now is marked as caught up to the baseline. That is the whole point of the
 * migration: without it, the first load after upgrading would greet every user with the backlog
 * they have already read. Users created afterwards have no row, and the frontend reads that
 * absence as "new here, show nothing and quietly record the current version".
 *
 * `news_hash` is deliberately left in place. Nothing reads it any more, but removing it would make
 * a downgrade lose the fact that these dialogs were ever dismissed.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const users = db.prepare(`SELECT id FROM users`).all();
  const exists = db.prepare(
    `SELECT 1 FROM settings WHERE name = 'news_last_seen_version' AND user_id = @userId LIMIT 1`,
  );
  const insert = db.prepare(
    `INSERT INTO settings (id, create_date, name, value, user_id)
     VALUES (@id, @create_date, 'news_last_seen_version', @value, @userId)`,
  );

  for (const { id: userId } of users) {
    if (exists.get({ userId })) continue;
    insert.run({
      id: nanoid(),
      create_date: Date.now(),
      value: JSON.stringify(NEWS_BASELINE_VERSION),
      userId,
    });
  }
}
