/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFileSync } from 'fs';
import { nanoid } from 'nanoid';
import semver from 'semver';

/**
 * The version this installation runs, or `null` when its package.json cannot be read.
 *
 * Read here rather than through `getPackageVersion()`: that one is async, and the migration runner
 * calls `up` synchronously inside a transaction.
 *
 * @returns {string|null}
 */
function runningVersion() {
  try {
    return JSON.parse(readFileSync(new URL('../../../../../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return null;
  }
}

/**
 * @param {string} value A settings value, stored as JSON.
 * @returns {any}
 */
function parse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Mark the release notes of the running version as seen, for everyone.
 *
 * The dialog after an upgrade now shows the GitHub notes of the newest installed release when it is
 * newer than `news_last_seen_version`. That marker was last written from the hand-kept news.json,
 * which stopped at 29.1.0, so without this every existing user would be shown the notes of a
 * version they already run on the first load. Starting everybody at the running version means the
 * dialog speaks up at the next upgrade, with that upgrade's notes.
 *
 * Read from package.json when it runs, unlike migration 29's fixed baseline: the line is "what you
 * run now", whichever release you happen to upgrade with. A marker that is already newer (an
 * install that went back a version) is left alone, and an unreadable version changes nothing.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string|null} [version] The running version; injectable for tests.
 * @returns {void}
 */
export function up(db, version = runningVersion()) {
  if (!semver.valid(version)) {
    return;
  }
  const value = JSON.stringify(version);
  const users = db.prepare(`SELECT id FROM users`).all();
  const current = db.prepare(
    `SELECT value FROM settings WHERE name = 'news_last_seen_version' AND user_id = @userId LIMIT 1`,
  );
  const update = db.prepare(
    `UPDATE settings SET value = @value WHERE name = 'news_last_seen_version' AND user_id = @userId`,
  );
  const insert = db.prepare(
    `INSERT INTO settings (id, create_date, name, value, user_id)
     VALUES (@id, @create_date, 'news_last_seen_version', @value, @userId)`,
  );

  for (const { id: userId } of users) {
    const row = current.get({ userId });
    if (row == null) {
      insert.run({ id: nanoid(), create_date: Date.now(), value, userId });
      continue;
    }
    const seen = parse(row.value);
    if (semver.valid(seen) && semver.gte(seen, version)) {
      continue;
    }
    update.run({ value, userId });
  }
}
