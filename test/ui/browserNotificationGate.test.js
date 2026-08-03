/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { BROWSER_ADAPTER_ID, usesBrowserAdapter } from '../../ui/src/services/notifications/browserAdapter.js';
import { config as browserAdapterConfig } from '../../lib/notification/adapter/browser.js';

const hook = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../../ui/src/hooks/useBrowserNotifications.js'),
  'utf-8',
);

/**
 * @param {string[]} adapterIds
 * @returns {Object}
 */
function job(...adapterIds) {
  return { notificationAdapter: adapterIds.map((id) => ({ id, name: id, fields: {} })) };
}

describe('when Fredy asks for notification permission', () => {
  it('uses the id the backend adapter actually publishes', () => {
    // A silent mismatch here means the prompt is never shown and browser notifications never
    // arrive, with nothing anywhere to say why.
    expect(browserAdapterConfig.id).toBe(BROWSER_ADAPTER_ID);
  });

  it('asks when a job sends browser notifications', () => {
    expect(usesBrowserAdapter([job('browser')])).toBe(true);
    expect(usesBrowserAdapter([job('slack'), job('telegram', 'browser')])).toBe(true);
  });

  it('stays quiet when no job does', () => {
    expect(usesBrowserAdapter([job('slack'), job('telegram', 'email')])).toBe(false);
  });

  it('stays quiet on an instance with no jobs at all, which is every first visit', () => {
    expect(usesBrowserAdapter([])).toBe(false);
  });

  it.each([
    undefined,
    null,
    'nonsense',
    {},
    [null],
    [{}],
    [{ notificationAdapter: null }],
    [{ notificationAdapter: {} }],
  ])('stays quiet rather than throwing on %s', (jobs) => {
    expect(usesBrowserAdapter(jobs)).toBe(false);
  });

  it('only calls requestPermission behind that check', () => {
    // The prompt used to fire on every load for everybody. Guarding it is the whole point of the
    // change, so the guard itself is worth pinning down.
    const before = hook.indexOf('wantsBrowserNotifications');
    const call = hook.indexOf('Notification.requestPermission');
    expect(before).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(before);
    expect(hook).toContain('if (!wantsBrowserNotifications) return;');
  });
});
