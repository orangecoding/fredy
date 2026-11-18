/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The items of the RSS notification channels.
 *
 * Every other adapter hands its message to a service and forgets it. An RSS reader asks for the
 * message later, so the rss adapter has to keep what it would have sent: one row per notification,
 * rendered at the moment it went out, the same way a Telegram message keeps the text it was sent with.
 *
 * Deliberately a snapshot, with no reference to `listings` or `jobs`. A listing deleted or purged
 * afterwards must not pull its entry out of a feed whose readers have already shown it, and a price
 * change is an event of its own, not a property of the listing as it is now. The only owner is the
 * channel: deleting it drops its feed with it.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_feed_item
    (
      id          TEXT PRIMARY KEY,
      channel_id  TEXT    NOT NULL,
      kind        TEXT    NOT NULL,
      title       TEXT    NOT NULL,
      link        TEXT,
      description TEXT,
      image_url   TEXT,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (channel_id) REFERENCES configured_adapter (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_notification_feed_item_channel ON notification_feed_item (channel_id, created_at);
  `);
}
