/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import {
  deviceName,
  pushSupport,
  urlBase64ToUint8Array,
  withTimeout,
} from '../../ui/src/services/push/webPushClient.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15';

/**
 * A window with just what `pushSupport` looks at.
 *
 * @param {Object} options
 * @returns {Object}
 */
function fakeWindow({
  secure = true,
  userAgent = ANDROID_CHROME,
  touchPoints = 0,
  push = true,
  permission = 'default',
  standalone = false,
} = {}) {
  const win = {
    isSecureContext: secure,
    navigator: { userAgent, maxTouchPoints: touchPoints, ...(push ? { serviceWorker: {} } : {}) },
    matchMedia: () => ({ matches: standalone }),
  };
  if (push) {
    win.PushManager = function PushManager() {};
    win.Notification = { permission };
  }
  return win;
}

describe('what a device can do about push', () => {
  it('needs a secure context', () => {
    expect(pushSupport(fakeWindow({ secure: false }))).toBe('insecure');
  });

  it('tells iPhone and iPad users in Safari to install Fredy first', () => {
    // Safari hides the Push API in a tab, so "unsupported" would be the wrong answer there.
    expect(pushSupport(fakeWindow({ userAgent: IPHONE, push: false }))).toBe('ios-install');
    // iPadOS reports itself as a Mac with a touch screen.
    expect(pushSupport(fakeWindow({ userAgent: MAC_SAFARI, touchPoints: 5, push: false }))).toBe('ios-install');
  });

  it('offers push inside the home-screen app on iOS', () => {
    expect(pushSupport(fakeWindow({ userAgent: IPHONE, standalone: true }))).toBe('available');
  });

  it('says when the browser has no push, or blocks it', () => {
    expect(pushSupport(fakeWindow({ push: false }))).toBe('unsupported');
    expect(pushSupport(fakeWindow({ permission: 'denied' }))).toBe('denied');
  });

  it('offers push on a desktop Mac and on Android', () => {
    expect(pushSupport(fakeWindow({ userAgent: MAC_SAFARI }))).toBe('available');
    expect(pushSupport(fakeWindow({ permission: 'granted' }))).toBe('available');
  });
});

describe('push helpers', () => {
  it('decodes the base64url VAPID key', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID_-8'))).toEqual([1, 2, 3, 255, 239]);
  });

  it('names a device from its user agent', () => {
    expect(deviceName(IPHONE)).toBe('Safari · iPhone');
    expect(deviceName(ANDROID_CHROME)).toBe('Chrome · Android');
    expect(deviceName(null)).toBeNull();
  });

  it('gives up on a push service that never answers', async () => {
    await expect(withTimeout(new Promise(() => {}), 10, 'no answer')).rejects.toThrow('no answer');
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'no answer')).resolves.toBe('ok');
  });
});
