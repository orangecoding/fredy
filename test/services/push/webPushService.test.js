/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

let storedSettings;
let subscriptions;

vi.mock('web-push', () => ({
  generateVAPIDKeys: vi.fn(() => ({ publicKey: 'generated-public', privateKey: 'generated-private' })),
  sendNotification: vi.fn(),
}));
vi.mock('../../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => storedSettings),
  upsertSettings: vi.fn((values) => {
    storedSettings = { ...storedSettings, ...values };
  }),
}));
vi.mock('../../../lib/services/storage/pushSubscriptionStorage.js', () => ({
  getPushSubscriptions: vi.fn(() => subscriptions),
  dropPushSubscription: vi.fn(),
  markPushSuccess: vi.fn(),
  markPushError: vi.fn(),
}));
vi.mock('../../../lib/services/logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const webPush = await import('web-push');
const { upsertSettings } = await import('../../../lib/services/storage/settingsStorage.js');
const storage = await import('../../../lib/services/storage/pushSubscriptionStorage.js');
const { buildPushPayload, getOrCreateVapidKeys, MAX_PAYLOAD_BYTES, sendPushToUser, vapidSubject } =
  await import('../../../lib/services/push/webPushService.js');

const device = (n, origin = 'https://fredy.example') => ({
  id: `s${n}`,
  userId: 'u1',
  endpoint: `https://push.example/${n}`,
  p256dh: `p256dh-${n}`,
  auth: `auth-${n}`,
  origin,
});

const message = {
  title: 'Bright two rooms',
  body: 'Price: 1.200 €',
  url: '/#/listings/listing/l1',
  tag: 'fredy-listing-l1',
};

beforeEach(() => {
  vi.clearAllMocks();
  storedSettings = { baseUrl: 'https://fredy.example', web_push_vapid: { publicKey: 'pub', privateKey: 'priv' } };
  subscriptions = [];
});

describe('VAPID keys', () => {
  it('creates the key pair once and keeps it in the settings', async () => {
    storedSettings = {};
    const [first, second] = await Promise.all([getOrCreateVapidKeys(), getOrCreateVapidKeys()]);

    expect(first).toEqual({ publicKey: 'generated-public', privateKey: 'generated-private' });
    expect(second).toEqual(first);
    // Two first calls at once must not create two keys: a device would subscribe with one and
    // never receive anything signed with the other.
    expect(webPush.generateVAPIDKeys).toHaveBeenCalledTimes(1);
    expect(upsertSettings).toHaveBeenCalledWith({ web_push_vapid: first });
  });

  it('reuses the stored pair', async () => {
    expect(await getOrCreateVapidKeys()).toEqual({ publicKey: 'pub', privateKey: 'priv' });
    expect(webPush.generateVAPIDKeys).not.toHaveBeenCalled();
  });
});

describe('VAPID subject', () => {
  it('prefers an https base URL', () => {
    expect(vapidSubject('https://fredy.example', 'https://other.example')).toBe('https://fredy.example');
  });

  it('falls back to the https origin the device subscribed from', () => {
    // Apple refuses http and localhost subjects, which is what a LAN base URL usually is.
    expect(vapidSubject('http://192.168.1.10:9998', 'https://fredy.example')).toBe('https://fredy.example');
    expect(vapidSubject(undefined, 'https://fredy.example')).toBe('https://fredy.example');
  });

  it('uses a mailto contact when no https address is known', () => {
    expect(vapidSubject('http://localhost:9998', 'http://localhost:5173')).toMatch(/^mailto:/);
  });
});

describe('push payload', () => {
  it('carries what the service worker shows', () => {
    const payload = JSON.parse(buildPushPayload({ ...message, image: 'https://cdn.example/1.jpg' }));
    expect(payload).toMatchObject({
      title: 'Bright two rooms',
      body: 'Price: 1.200 €',
      url: '/#/listings/listing/l1',
      tag: 'fredy-listing-l1',
      image: 'https://cdn.example/1.jpg',
      icon: '/icons/icon-192.png',
    });
  });

  it('stays below the push size limit with a very long description', () => {
    const payload = buildPushPayload({
      ...message,
      title: 'T'.repeat(5000),
      body: 'Ä'.repeat(20000),
      image: `https://cdn.example/${'x'.repeat(5000)}.jpg`,
    });
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    expect(JSON.parse(payload)).toMatchObject({ url: '/#/listings/listing/l1', tag: 'fredy-listing-l1' });
  });

  it('leaves out pictures that are not https', () => {
    expect(JSON.parse(buildPushPayload({ ...message, image: 'http://cdn.example/1.jpg' }))).not.toHaveProperty('image');
  });
});

describe('sending', () => {
  it('sends to every device of the user', async () => {
    subscriptions = [device(1), device(2, 'https://lan.example')];
    storedSettings.baseUrl = 'http://192.168.1.10:9998';
    webPush.sendNotification.mockResolvedValue({ statusCode: 201 });

    const result = await sendPushToUser('u1', message, { urgency: 'high' });

    expect(result).toEqual({ sent: 2, failed: 0, removed: 0 });
    expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
    const [target, payload, options] = webPush.sendNotification.mock.calls[1];
    expect(target).toEqual({ endpoint: 'https://push.example/2', keys: { p256dh: 'p256dh-2', auth: 'auth-2' } });
    expect(JSON.parse(payload).tag).toBe('fredy-listing-l1');
    expect(options).toMatchObject({
      vapidDetails: { subject: 'https://lan.example', publicKey: 'pub', privateKey: 'priv' },
      TTL: 86400,
      urgency: 'high',
    });
    expect(storage.markPushSuccess).toHaveBeenCalledWith('s1');
    expect(storage.markPushSuccess).toHaveBeenCalledWith('s2');
  });

  it('forgets a device the push service reports as gone, and keeps the others', async () => {
    subscriptions = [device(1), device(2), device(3)];
    webPush.sendNotification
      .mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error('Server error'), { statusCode: 500, body: 'try later' }))
      .mockResolvedValueOnce({ statusCode: 201 });

    const result = await sendPushToUser('u1', message);

    expect(result).toEqual({ sent: 1, failed: 1, removed: 1 });
    expect(storage.dropPushSubscription).toHaveBeenCalledWith('s1');
    expect(storage.markPushError).toHaveBeenCalledWith('s2', '500 try later');
    expect(storage.dropPushSubscription).not.toHaveBeenCalledWith('s2');
    expect(storage.markPushSuccess).toHaveBeenCalledWith('s3');
  });

  it('does nothing for a user without devices', async () => {
    expect(await sendPushToUser('u1', message)).toEqual({ sent: 0, failed: 0, removed: 0 });
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });
});
