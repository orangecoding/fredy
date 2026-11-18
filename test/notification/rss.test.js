/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { up as createChannelTable } from '../../lib/services/storage/migrations/sql/32.configured-adapters.js';
import { up as createFeedTable } from '../../lib/services/storage/migrations/sql/58.notification-feed-items.js';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params = {}) => db.prepare(sql).all(params),
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    withTransaction: (cb) => db.transaction(() => cb(db))(),
  },
}));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  getJob: (jobKey) => (jobKey === 'job-1' ? { id: 'job-1', name: 'Berlin flats' } : null),
}));
vi.mock('../../lib/services/markdown.js', () => ({ readAdapterReadme: () => '' }));

const { send, sendPriceChange, config } = await import('../../lib/notification/adapter/rss.js');
const feedStorage = await import('../../lib/services/storage/notificationFeedStorage.js');

const listing = {
  id: 'l1',
  title: 'Bright two rooms',
  link: 'https://portal.example/expose/1',
  address: 'Torstrasse 1, Berlin',
  price: '1.200 €',
  size: '60 m²',
  rooms: '2 rooms',
  image: 'https://cdn.example/1.jpg',
  commute: '20 min to Office',
};

/**
 * The adapter only ever sees the hydrated channel entry, `{ id, fields }`.
 * @param {string} token
 */
const configFor = (token) => [{ id: 'rss', fields: { token } }];

const seedChannel = (id, token) =>
  db
    .prepare(
      `INSERT INTO configured_adapter (id, user_id, adapter_id, name, fields, visibility, created_at, updated_at)
       VALUES (?, 'u1', 'rss', ?, ?, 'private', 0, 0)`,
    )
    .run(id, `Feed ${id}`, JSON.stringify({ token }));

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users (id) VALUES ('u1');`);
  db.exec(`CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT, notification_adapter TEXT);`);
  createChannelTable(db);
  createFeedTable(db);
  seedChannel('c1', 'token-1');
  seedChannel('c2', 'token-2');
});

afterEach(() => {
  db.close();
});

describe('rss notification adapter', () => {
  it('marks its token as a generated secret, which is what keeps it out of the form and the wire', () => {
    expect(config.fields.token).toMatchObject({ secret: true, generated: true, urlPath: '/api/feed/' });
  });

  it('keeps new listings in the feed of the channel the token belongs to', async () => {
    await send({
      newListings: [listing],
      notificationConfig: configFor('token-1'),
      jobKey: 'job-1',
      baseUrl: 'https://fredy.example',
    });

    expect(feedStorage.getFeedItems('c2')).toEqual([]);
    const [item] = feedStorage.getFeedItems('c1');
    expect(item).toMatchObject({
      kind: 'listing',
      title: 'Berlin flats: Bright two rooms',
      link: 'https://portal.example/expose/1',
      imageUrl: 'https://cdn.example/1.jpg',
    });
    expect(item.description.split('\n')).toEqual([
      '1.200 € | 60 m² | 2 rooms',
      'Address: Torstrasse 1, Berlin',
      'Commute: 20 min to Office',
      'Open in Fredy: https://fredy.example/#/listings/listing/l1',
    ]);
  });

  it('falls back to the job key when the job is gone, as on a test call', async () => {
    await send({ newListings: [listing], notificationConfig: configFor('token-1'), jobKey: 'TestJob' });
    expect(feedStorage.getFeedItems('c1')[0].title).toBe('TestJob: Bright two rooms');
  });

  it('keeps a price change as an item of its own', async () => {
    await send({ newListings: [listing], notificationConfig: configFor('token-1'), jobKey: 'job-1' });
    await sendPriceChange({
      priceChanges: [
        {
          ...listing,
          changeHeadline: 'Price drop',
          oldPrice: '1.200 €',
          newPrice: '1.100 €',
          changePercent: '-8.3%',
        },
      ],
      notificationConfig: configFor('token-1'),
      jobKey: 'job-1',
    });

    const items = feedStorage.getFeedItems('c1');
    expect(items.map((item) => item.kind)).toEqual(['priceChange', 'listing']);
    expect(items[0].title).toBe('Berlin flats: Price drop: 1.200 € -> 1.100 € (-8.3%)');
    expect(items[0].id).not.toBe(items[1].id);
  });

  it('refuses a token no channel owns, which is a draft that was never saved', async () => {
    await expect(send({ newListings: [listing], notificationConfig: configFor(''), jobKey: 'job-1' })).rejects.toThrow(
      /Save the channel first/,
    );
    await expect(
      send({ newListings: [listing], notificationConfig: configFor('nobody'), jobKey: 'job-1' }),
    ).rejects.toThrow(/Save the channel first/);
  });

  it('keeps only the newest items, in the order they were sent', async () => {
    const many = Array.from({ length: feedStorage.MAX_FEED_ITEMS + 5 }, (_, index) => ({
      ...listing,
      id: `l${index}`,
      title: `Flat ${index}`,
    }));
    await send({ newListings: many, notificationConfig: configFor('token-1'), jobKey: 'job-1' });

    const items = feedStorage.getFeedItems('c1');
    expect(items).toHaveLength(feedStorage.MAX_FEED_ITEMS);
    expect(items[0].title).toBe(`Berlin flats: Flat ${feedStorage.MAX_FEED_ITEMS + 4}`);
    expect(items.at(-1).title).toBe('Berlin flats: Flat 5');
    expect(db.prepare('SELECT COUNT(1) AS n FROM notification_feed_item').get().n).toBe(feedStorage.MAX_FEED_ITEMS);
  });

  it('drops the feed together with its channel', async () => {
    await send({ newListings: [listing], notificationConfig: configFor('token-1'), jobKey: 'job-1' });
    db.prepare(`DELETE FROM configured_adapter WHERE id = 'c1'`).run();
    expect(db.prepare('SELECT COUNT(1) AS n FROM notification_feed_item').get().n).toBe(0);
  });

  it('only finds rss channels by token', () => {
    db.prepare(
      `INSERT INTO configured_adapter (id, user_id, adapter_id, name, fields, visibility, created_at, updated_at)
       VALUES ('t1', 'u1', 'telegram', 'Chat', '{"token":"bot-token"}', 'private', 0, 0)`,
    ).run();
    expect(feedStorage.getFeedChannel('bot-token')).toBeNull();
    expect(feedStorage.getFeedChannel('token-2')?.id).toBe('c2');
    expect(feedStorage.getFeedChannel(undefined)).toBeNull();
  });
});
