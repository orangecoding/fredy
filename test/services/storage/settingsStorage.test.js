/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const clearProxyCacheMock = vi.fn();

vi.mock('../../../lib/services/http/httpClient.js', () => ({
  clearProxyCache: clearProxyCacheMock,
}));

vi.mock('../../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: vi.fn(() => []),
    execute: vi.fn(() => ({ changes: 1 })),
  },
}));

vi.mock('../../../lib/utils.js', () => ({
  fromJson: (val, fallback) => {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  },
  toJson: (val) => JSON.stringify(val),
  readConfigFromStorage: () => ({}),
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'test-id',
}));

const { upsertSettings } = await import('../../../lib/services/storage/settingsStorage.js');

describe('settingsStorage proxy cache clearing', () => {
  beforeEach(() => {
    clearProxyCacheMock.mockClear();
  });

  it('calls clearProxyCache when global settings updated', () => {
    upsertSettings({ proxyUrl: 'http://proxy:8080' });

    expect(clearProxyCacheMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT call clearProxyCache for user-scoped settings', () => {
    upsertSettings({ someSetting: 'value' }, 'user123');

    expect(clearProxyCacheMock).not.toHaveBeenCalled();
  });
});
