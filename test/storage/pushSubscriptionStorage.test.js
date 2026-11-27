/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { up } from '../../lib/services/storage/migrations/sql/62.push-subscriptions.js';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params = {}) => db.prepare(sql).all(params),
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    withTransaction: (cb) => db.transaction(() => cb(db))(),
  },
}));

const {
  dropPushSubscription,
  getPushSubscriptions,
  listPushDevices,
  markPushError,
  markPushSuccess,
  removePushSubscription,
  upsertPushSubscription,
} = await import('../../lib/services/storage/pushSubscriptionStorage.js');

const subscription = (n, extra = {}) => ({
  endpoint: `https://push.example/${n}`,
  p256dh: `p256dh-${n}`,
  auth: `auth-${n}`,
  ...extra,
});

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users (id) VALUES ('u1'), ('u2');`);
  up(db);
});

afterEach(() => db.close());

describe('migration 62 - push subscriptions', () => {
  it('can run twice', () => {
    expect(() => up(db)).not.toThrow();
  });

  it('removes a user’s devices with the user', () => {
    upsertPushSubscription('u1', subscription(1));
    db.prepare(`DELETE FROM users WHERE id = 'u1'`).run();
    expect(db.prepare(`SELECT COUNT(*) AS n FROM push_subscription`).get().n).toBe(0);
  });
});

describe('push subscription storage', () => {
  it('keeps one row per endpoint and refreshes its keys', () => {
    upsertPushSubscription('u1', subscription(1), 1000);
    upsertPushSubscription('u1', subscription(1, { p256dh: 'rotated', userAgent: 'Firefox' }), 2000);

    const rows = getPushSubscriptions('u1');
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe('rotated');
    // Re-subscribing the same device is not a new device.
    expect(listPushDevices('u1')[0]).toMatchObject({ createdAt: 1000, userAgent: 'Firefox' });
  });

  it('moves an endpoint to the user who subscribed it last', () => {
    upsertPushSubscription('u1', subscription(1), 1000);
    markPushSuccess(getPushSubscriptions('u1')[0].id, 1500);
    upsertPushSubscription('u2', subscription(1), 2000);

    expect(getPushSubscriptions('u1')).toHaveLength(0);
    expect(getPushSubscriptions('u2')).toHaveLength(1);
    // The other user's history does not travel with the browser.
    expect(listPushDevices('u2')[0]).toMatchObject({ createdAt: 2000, lastSuccessAt: null });
  });

  it('removes only the calling user’s rows', () => {
    upsertPushSubscription('u1', subscription(1));
    upsertPushSubscription('u2', subscription(2));
    const foreignId = getPushSubscriptions('u2')[0].id;

    expect(removePushSubscription('u1', { endpoint: 'https://push.example/2' })).toBe(false);
    expect(removePushSubscription('u1', { id: foreignId })).toBe(false);
    expect(getPushSubscriptions('u2')).toHaveLength(1);

    expect(removePushSubscription('u1', { endpoint: 'https://push.example/1' })).toBe(true);
    expect(getPushSubscriptions('u1')).toHaveLength(0);
  });

  it('records success and errors, and drops a gone subscription', () => {
    upsertPushSubscription('u1', subscription(1));
    const { id } = getPushSubscriptions('u1')[0];

    markPushError(id, '500 Internal Server Error');
    expect(listPushDevices('u1')[0]).toMatchObject({ lastError: '500 Internal Server Error' });

    markPushSuccess(id, 5000);
    expect(listPushDevices('u1')[0]).toMatchObject({ lastSuccessAt: 5000, lastError: null });

    dropPushSubscription(id);
    expect(listPushDevices('u1')).toEqual([]);
  });
});
