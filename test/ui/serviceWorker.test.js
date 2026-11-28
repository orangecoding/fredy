/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/sw.js'), 'utf-8');

/**
 * Runs `public/sw.js` against a fake service worker global and returns its listeners.
 *
 * @param {Object} [options]
 * @param {Array<Object>} [options.windows] What `clients.matchAll` finds.
 * @returns {Object}
 */
function loadWorker({ windows = [] } = {}) {
  const listeners = {};
  const self = {
    location: { origin: 'https://fredy.example' },
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => {}), pushManager: { subscribe: vi.fn() } },
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => {}) },
  };
  vm.runInNewContext(source, { self, URL, JSON, fetch: vi.fn() });
  return { self, listeners };
}

/**
 * Dispatch an event and wait for what it handed to `waitUntil`.
 *
 * @param {Function} listener
 * @param {Object} event
 * @returns {Promise<void>}
 */
async function dispatch(listener, event) {
  let pending = Promise.resolve();
  listener({ ...event, waitUntil: (promise) => (pending = promise) });
  await pending;
}

describe('service worker', () => {
  it('has no fetch handler, so it can never serve a stale interface', () => {
    const { listeners } = loadWorker();
    expect(listeners.fetch).toBeUndefined();
  });

  it('shows every push as a notification that remembers where to go', async () => {
    const { self, listeners } = loadWorker();
    const payload = {
      title: 'Bright two rooms',
      body: 'Price: 1.200 €',
      url: '/#/listings/listing/l1',
      tag: 'fredy-listing-l1',
      image: 'https://cdn.example/1.jpg',
    };

    await dispatch(listeners.push, { data: { json: () => payload, text: () => JSON.stringify(payload) } });

    expect(self.registration.showNotification).toHaveBeenCalledWith('Bright two rooms', {
      body: 'Price: 1.200 €',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: 'fredy-listing-l1',
      image: 'https://cdn.example/1.jpg',
      data: { url: '/#/listings/listing/l1' },
    });
  });

  it('still shows something for a push it cannot read', async () => {
    // Safari revokes the subscription of a web app that receives a push and shows nothing.
    const { self, listeners } = loadWorker();
    await dispatch(listeners.push, {
      data: {
        json: () => {
          throw new Error('not json');
        },
        text: () => 'plain text',
      },
    });
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      'Fredy',
      expect.objectContaining({ body: 'plain text' }),
    );
  });

  it('opens the listing in a Fredy window that is already open', async () => {
    const open = { url: 'https://fredy.example/#/dashboard', focus: vi.fn(), navigate: vi.fn(async () => {}) };
    open.focus.mockResolvedValue(open);
    const { self, listeners } = loadWorker({ windows: [open] });
    const notification = { close: vi.fn(), data: { url: '/#/listings/listing/l1' } };

    await dispatch(listeners.notificationclick, { notification });

    expect(notification.close).toHaveBeenCalled();
    expect(open.navigate).toHaveBeenCalledWith('https://fredy.example/#/listings/listing/l1');
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it('opens a new window when no Fredy window is open', async () => {
    const { self, listeners } = loadWorker({ windows: [] });
    await dispatch(listeners.notificationclick, {
      notification: { close: vi.fn(), data: { url: '/#/listings/listing/l1' } },
    });
    expect(self.clients.openWindow).toHaveBeenCalledWith('https://fredy.example/#/listings/listing/l1');
  });
});
