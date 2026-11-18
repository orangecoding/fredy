/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';
import SqliteConnection from './SqliteConnection.js';
import { getChannel } from './configuredAdapterStorage.js';

/** The adapter whose channels have a feed. */
export const FEED_ADAPTER_ID = 'rss';

/**
 * How many items a feed keeps, and serves.
 *
 * A reader polls and remembers what it has seen, so the feed only has to bridge the time a reader
 * is offline. One number for both keeps "what is stored" and "what is served" from disagreeing.
 */
export const MAX_FEED_ITEMS = 100;

/**
 * @typedef {Object} FeedItemInput
 * @property {'listing'|'priceChange'} kind
 * @property {string} title
 * @property {string|null} [link]
 * @property {string|null} [description] Plain text, one line per line. The renderer escapes it.
 * @property {string|null} [imageUrl]
 */

/**
 * @typedef {Object} FeedItem
 * @property {string} id Stable, used as the item's guid.
 * @property {'listing'|'priceChange'} kind
 * @property {string} title
 * @property {string|null} link
 * @property {string|null} description
 * @property {string|null} imageUrl
 * @property {number} createdAt
 */

/**
 * The rss channel a feed token belongs to.
 *
 * The token is the only credential a feed has, since a feed reader cannot sign in. It is compared
 * in SQL, the same way the MCP bearer token is.
 *
 * @param {unknown} token
 * @returns {import('./configuredAdapterStorage.js').Channel|null}
 */
export const getFeedChannel = (token) => {
  if (typeof token !== 'string' || token.length === 0) return null;
  const row = SqliteConnection.query(
    `SELECT id
     FROM configured_adapter
     WHERE adapter_id = @adapterId
       AND json_extract(fields, '$.token') = @token
     LIMIT 1`,
    { adapterId: FEED_ADAPTER_ID, token },
  )[0];
  return row ? getChannel(row.id) : null;
};

/**
 * Append items to a channel's feed and drop whatever falls off the end.
 *
 * @param {string} channelId
 * @param {FeedItemInput[]} items
 * @param {number} [now]
 * @returns {void}
 */
export const addFeedItems = (channelId, items, now = Date.now()) => {
  if (typeof channelId !== 'string' || !Array.isArray(items) || items.length === 0) return;

  SqliteConnection.withTransaction((db) => {
    const insert = db.prepare(
      `INSERT INTO notification_feed_item (id, channel_id, kind, title, link, description, image_url, created_at)
       VALUES (@id, @channelId, @kind, @title, @link, @description, @imageUrl, @createdAt)`,
    );
    for (const item of items) {
      insert.run({
        id: nanoid(),
        channelId,
        kind: item.kind,
        title: item.title,
        link: item.link ?? null,
        description: item.description ?? null,
        imageUrl: item.imageUrl ?? null,
        createdAt: now,
      });
    }
    // One batch shares its timestamp, so the rowid is what keeps the order it was sent in.
    db.prepare(
      `DELETE FROM notification_feed_item
       WHERE channel_id = @channelId
         AND id NOT IN (SELECT id
                        FROM notification_feed_item
                        WHERE channel_id = @channelId
                        ORDER BY created_at DESC, rowid DESC
                        LIMIT @keep)`,
    ).run({ channelId, keep: MAX_FEED_ITEMS });
  });
};

/**
 * A channel's feed, newest first.
 *
 * @param {string} channelId
 * @returns {FeedItem[]}
 */
export const getFeedItems = (channelId) =>
  SqliteConnection.query(
    `SELECT id, kind, title, link, description, image_url AS imageUrl, created_at AS createdAt
     FROM notification_feed_item
     WHERE channel_id = @channelId
     ORDER BY created_at DESC, rowid DESC
     LIMIT @limit`,
    { channelId, limit: MAX_FEED_ITEMS },
  );
