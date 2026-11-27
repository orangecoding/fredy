/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { xhrDelete, xhrGet, xhrPost } from '../xhr';

/**
 * Web Push on this device (#542): the service worker, the browser subscription, and the server's
 * copy of it.
 *
 * Everything that has to happen inside a click (the permission prompt above all, which iOS only
 * shows from a user gesture) is in {@link enablePush}; nothing here asks on its own.
 */

/** Where the service worker is served from. Its scope is the whole app. */
export const SERVICE_WORKER_URL = '/sw.js';

/**
 * What this device can do about push, in the order the checks run.
 *
 * - `insecure`: not a secure context (plain http on a LAN address); browsers only push over https.
 * - `ios-install`: iPhone or iPad in Safari; push needs Fredy on the home screen first.
 * - `unsupported`: the browser has no Push API.
 * - `denied`: notifications are blocked in the browser settings.
 * - `available`: push can be switched on here.
 *
 * @typedef {'insecure'|'ios-install'|'unsupported'|'denied'|'available'} PushSupport
 */

/**
 * Whether the browser runs on an iPhone or iPad, including iPadOS reporting itself as a Mac.
 *
 * @param {Navigator} nav
 * @returns {boolean}
 */
export function isIos(nav) {
  const userAgent = nav?.userAgent ?? '';
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && (nav?.maxTouchPoints ?? 0) > 1;
}

/**
 * Whether Fredy runs as an installed app rather than in a browser tab.
 *
 * @param {Window} win
 * @returns {boolean}
 */
export function isStandalone(win) {
  if (win?.navigator?.standalone === true) return true;
  return typeof win?.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
}

/**
 * What this device can do about push. Pure, so it can be tested with a fake window.
 *
 * @param {Window} win
 * @returns {PushSupport}
 */
export function pushSupport(win = typeof window === 'undefined' ? undefined : window) {
  if (!win || win.isSecureContext === false) return 'insecure';
  const nav = win.navigator;
  const hasPush = !!nav && 'serviceWorker' in nav && 'PushManager' in win && 'Notification' in win;
  // Safari on iOS exposes the Push API only inside a home-screen app, so in a tab it looks like a
  // browser without push; the useful answer there is how to install it.
  if (isIos(nav) && !isStandalone(win)) return 'ios-install';
  if (!hasPush) return 'unsupported';
  if (win.Notification.permission === 'denied') return 'denied';
  return 'available';
}

/**
 * Turn the base64url VAPID key into the bytes `pushManager.subscribe()` takes.
 *
 * @param {string} base64Url
 * @returns {Uint8Array}
 */
export function urlBase64ToUint8Array(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

/**
 * Register the service worker. Called once on start; a browser without service workers, or a page
 * outside a secure context, simply has none.
 *
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try {
    return await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' });
  } catch (error) {
    console.warn('Could not register the service worker', error);
    return null;
  }
}

/**
 * The registration, waiting for the worker if it is still being installed.
 *
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
async function readyRegistration() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const registration = (await navigator.serviceWorker.getRegistration('/')) ?? (await registerServiceWorker());
  if (!registration) return null;
  return navigator.serviceWorker.ready;
}

/**
 * This device's subscription, if it has one.
 *
 * @returns {Promise<PushSubscription|null>}
 */
export async function currentSubscription() {
  if (pushSupport() !== 'available') return null;
  // The registration as it is, without waiting for a worker to activate: sign-out goes through
  // here, and must not hang on a worker that never does.
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * The server's VAPID public key. Fetched before the tap by the settings page, so that nothing
 * between the permission prompt and the subscription waits on the network.
 *
 * @returns {Promise<string>}
 */
export async function fetchPublicKey() {
  const { json } = await xhrGet('/api/user/push/public-key');
  return json.publicKey;
}

/**
 * Switch push on for this device. Must run inside a click handler: iOS only shows the permission
 * prompt for a user gesture.
 *
 * @param {string} [publicKey] The key from {@link fetchPublicKey}, if already loaded.
 * @returns {Promise<'enabled'|'denied'|'unavailable'>}
 */
export async function enablePush(publicKey) {
  if (pushSupport() !== 'available') return 'unavailable';
  // Asked first, before anything awaits the network, so the prompt still counts as part of the tap.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const registration = await readyRegistration();
  if (!registration) return 'unavailable';
  const applicationServerKey = urlBase64ToUint8Array(publicKey ?? (await fetchPublicKey()));
  let subscription = await registration.pushManager.getSubscription();
  // A subscription made with another key (a restored or rebuilt instance) cannot receive this
  // server's pushes and has to be replaced.
  if (subscription && !sameKey(subscription.options?.applicationServerKey, applicationServerKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    // Some Chromium builds without Google's push registration never answer here; the button would
    // spin forever without the limit.
    subscription = await withTimeout(
      registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }),
      SUBSCRIBE_TIMEOUT_MS,
      'The browser’s push service did not answer.',
    );
  }
  await xhrPost('/api/user/push/subscriptions', { subscription: subscription.toJSON() });
  return 'enabled';
}

/** How long subscribing may take before the attempt counts as failed. */
export const SUBSCRIBE_TIMEOUT_MS = 20000;

/**
 * Reject when a promise does not settle in time.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Whether two keys are the same bytes. An unknown key counts as the same: older browsers do not
 * report it, and replacing a working subscription on a guess would be worse.
 *
 * @param {ArrayBuffer|null|undefined} stored
 * @param {Uint8Array} expected
 * @returns {boolean}
 */
function sameKey(stored, expected) {
  if (!stored) return true;
  const bytes = new Uint8Array(stored);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}

/**
 * Switch push off for this device: drop it on the server, then in the browser.
 *
 * @returns {Promise<void>}
 */
export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  try {
    await xhrDelete('/api/user/push/subscriptions', { endpoint: subscription.endpoint });
  } finally {
    await subscription.unsubscribe();
  }
}

/**
 * Tell the server about this device's subscription again, silently.
 *
 * Covers a row lost in a restore, a device whose push service rotated the subscription while the
 * service worker could not reach the server, and a browser that a different user signed in on.
 *
 * @returns {Promise<void>}
 */
export async function syncPushSubscription() {
  try {
    if (pushSupport() !== 'available' || Notification.permission !== 'granted') return;
    const subscription = await currentSubscription();
    if (subscription) await xhrPost('/api/user/push/subscriptions', { subscription: subscription.toJSON() });
  } catch (error) {
    console.warn('Could not sync the push subscription', error);
  }
}

/**
 * Before signing out: this device stops receiving the account's notifications.
 *
 * Subscriptions belong to the user rather than the session on purpose, so an expired session keeps
 * receiving; signing out deliberately is the one time a device should let go.
 *
 * @returns {Promise<void>}
 */
export async function releasePushOnLogout() {
  try {
    await disablePush();
  } catch (error) {
    console.warn('Could not remove this device from push before signing out', error);
  }
}

/**
 * Send a test notification to every device of the signed-in user.
 *
 * @returns {Promise<{sent: number, failed: number, removed: number}>}
 */
export async function sendTestPush() {
  const { json } = await xhrPost('/api/user/push/test');
  return json;
}

/**
 * The signed-in user's devices.
 *
 * @returns {Promise<Array<{id: string, endpoint: string, userAgent: string|null, createdAt: number, lastSuccessAt: number|null, lastError: string|null}>>}
 */
export async function listPushDevices() {
  const { json } = await xhrGet('/api/user/push/subscriptions');
  return Array.isArray(json) ? json : [];
}

/**
 * Remove a device from the list.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function removePushDevice(id) {
  await xhrDelete('/api/user/push/subscriptions', { id });
}

/**
 * A short name for a device from its user agent, e.g. "Safari on iPhone" or "Chrome on Android".
 *
 * @param {string|null} userAgent
 * @returns {string|null}
 */
export function deviceName(userAgent) {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\/|CriOS\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  const system = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Windows/.test(userAgent)
            ? 'Windows'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null;
  if (browser && system) return `${browser} · ${system}`;
  return browser ?? system;
}
