/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Fredy's service worker. It exists for Web Push (#542) and does nothing else: no caching and no
 * `fetch` handler, so it can never serve a stale interface after an update.
 *
 * A classic script rather than a module, because module service workers are not supported by every
 * browser Fredy runs in.
 */

const PUSH_PUBLIC_KEY_URL = '/api/user/push/public-key';
const PUSH_SUBSCRIPTIONS_URL = '/api/user/push/subscriptions';

self.addEventListener('install', () => {
  // Nothing to cache, so nothing to wait for: the new worker takes over at once.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Show what the server pushed.
 *
 * Every push shows a notification, without exception: Safari revokes the subscription of a web app
 * that receives pushes and shows nothing.
 */
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/badge-96.png',
    data: { url: data.url || '/' },
  };
  if (data.tag) options.tag = data.tag;
  if (data.image) options.image = data.image;
  event.waitUntil(self.registration.showNotification(data.title || 'Fredy', options));
});

/**
 * Open the listing in Fredy: in a Fredy window that is already open if there is one, otherwise in
 * a new one.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        try {
          const focused = await open.focus();
          await (focused || open).navigate(target);
          return;
        } catch {
          // An uncontrolled window cannot be navigated from here; a new one does the job.
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/**
 * The push service replaced the subscription (expired, or keys rotated). Subscribe again with the
 * same key and tell the server, so the device keeps receiving without anybody opening Fredy.
 * Works as long as the browser still holds a valid session; otherwise the next visit re-registers
 * the device.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      let subscription = event.newSubscription;
      if (!subscription) {
        let applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
        if (!applicationServerKey) {
          const response = await fetch(PUSH_PUBLIC_KEY_URL, { credentials: 'include' });
          if (!response.ok) return;
          applicationServerKey = (await response.json()).publicKey;
        }
        subscription = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      }
      await fetch(PUSH_SUBSCRIPTIONS_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (event.oldSubscription?.endpoint && event.oldSubscription.endpoint !== subscription.endpoint) {
        await fetch(PUSH_SUBSCRIPTIONS_URL, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: event.oldSubscription.endpoint }),
        });
      }
    })(),
  );
});
