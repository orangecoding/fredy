/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * The shared browser behind on-demand detail enrichment.
 *
 * One warmed session with surviving cookies instead of a zero-history browser per click -
 * minting the latter is DataDome's textbook bot shape. Every test runs against a throwaway
 * profile directory, never the real one.
 */
const launchCalls = [];
let launchedBrowsers = [];
let closedBrowsers = [];
let proxyUrl = '';
let launchBehavior = 'ok';

vi.mock('../../../lib/services/extractor/puppeteerExtractor.js', () => ({
  launchBrowser: async (url, options) => {
    launchCalls.push({ url, options });
    if (launchBehavior === 'hang') {
      return new Promise(() => {});
    }
    const browser = { connected: true, newPage: async () => ({}) };
    launchedBrowsers.push(browser);
    return browser;
  },
  closeBrowser: async (browser) => {
    closedBrowsers.push(browser);
  },
}));

vi.mock('../../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: async () => ({ proxyUrl }),
  getUserSettings: () => ({}),
}));

vi.mock('../../../lib/services/storage/SqliteConnection.js', () => ({
  default: {},
  computeDbPath: async () => ({ dir: '/never/used', file: '/never/used/listings.db' }),
}));

vi.mock('../../../lib/services/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let profileBase;
let previousProfileDir;
let manager;

beforeEach(async () => {
  vi.resetModules();
  launchCalls.length = 0;
  launchedBrowsers = [];
  closedBrowsers = [];
  proxyUrl = '';
  launchBehavior = 'ok';
  previousProfileDir = process.env.ENRICHMENT_PROFILE_DIR;
  profileBase = await fs.mkdtemp(path.join(os.tmpdir(), 'fredy-enrich-'));
  process.env.ENRICHMENT_PROFILE_DIR = path.join(profileBase, 'profile');
  manager = await import('../../../lib/services/listings/enrichmentBrowser.js');
});

afterEach(async () => {
  if (previousProfileDir === undefined) {
    delete process.env.ENRICHMENT_PROFILE_DIR;
  } else {
    process.env.ENRICHMENT_PROFILE_DIR = previousProfileDir;
  }
  await fs.rm(profileBase, { recursive: true, force: true });
});

describe('cooldown', () => {
  it('cools a refused provider down and lets it back in after the budget', async () => {
    const now = Date.now();

    expect(manager.isProviderCoolingDown('immowelt', now)).toBe(false);
    manager.coolDownProvider('immowelt', now);
    expect(manager.isProviderCoolingDown('immowelt', now)).toBe(true);
    expect(manager.isProviderCoolingDown('immowelt', now + manager.ENRICH_REFUSED_COOLDOWN_MS + 1)).toBe(false);
    // Other providers are unaffected.
    expect(manager.isProviderCoolingDown('immoscout', now)).toBe(false);
  });
});

describe('withEnrichmentBrowser', () => {
  it('launches once and reuses the warmed session with its profile', async () => {
    const seen = [];
    await manager.withEnrichmentBrowser(async (browser) => seen.push(browser), 'https://www.immowelt.de/expose/1');
    await manager.withEnrichmentBrowser(async (browser) => seen.push(browser), 'https://www.immowelt.de/expose/2');

    expect(launchCalls.length).toBe(1);
    expect(seen[0]).toBe(seen[1]);
    expect(launchCalls[0].options.userDataDir).toBe(path.join(profileBase, 'profile'));
    expect(closedBrowsers).toEqual([]);
  });

  it('serializes concurrent callers instead of minting parallel sessions', async () => {
    const order = [];
    const slow = manager.withEnrichmentBrowser(async () => {
      order.push('first-in');
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push('first-out');
    }, 'https://example.com/1');
    const fast = manager.withEnrichmentBrowser(async () => {
      order.push('second-in');
    }, 'https://example.com/2');
    await Promise.all([slow, fast]);

    expect(order).toEqual(['first-in', 'first-out', 'second-in']);
    expect(launchCalls.length).toBe(1);
  });

  it('answers a stalled spawn as a rejection and retries the next call', async () => {
    launchBehavior = 'hang';

    await expect(
      manager.withEnrichmentBrowser(async () => {}, 'https://example.com/1', { spawnTimeoutMs: 20 }),
    ).rejects.toThrow('timed out');
    expect(launchCalls.length).toBe(1);

    // The failed spawn poisons nothing: the next caller launches again.
    launchBehavior = 'ok';
    await manager.withEnrichmentBrowser(async () => {}, 'https://example.com/2', { spawnTimeoutMs: 500 });
    expect(launchCalls.length).toBe(2);
  });

  it('relaunches when the proxy changed, so the UI setting takes effect', async () => {
    await manager.withEnrichmentBrowser(async () => {}, 'https://example.com/1');
    proxyUrl = 'http://proxy:8080';
    await manager.withEnrichmentBrowser(async () => {}, 'https://example.com/2');

    expect(launchCalls.length).toBe(2);
    expect(launchCalls[1].options.proxyUrl).toBe('http://proxy:8080');
    expect(closedBrowsers).toEqual([launchedBrowsers[0]]);
  });
});
