/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockPage = {
  authenticate: vi.fn(),
  newPage: vi.fn(),
  setUserAgent: vi.fn(),
  setViewport: vi.fn(),
  setExtraHTTPHeaders: vi.fn(),
  evaluateOnNewDocument: vi.fn(),
  setCookie: vi.fn(),
  goto: vi.fn(() => ({ status: () => 200 })),
  waitForSelector: vi.fn(),
  evaluate: vi.fn(() => '<html></html>'),
  content: vi.fn(() => '<html></html>'),
  close: vi.fn(),
  mouse: { move: vi.fn() },
};

let mockBrowser;
let launchCalls;

function createMockBrowser() {
  mockBrowser = {
    newPage: vi.fn(() => mockPage),
    close: vi.fn(),
    isConnected: vi.fn(() => true),
  };
  return mockBrowser;
}

vi.mock('puppeteer-extra', () => ({
  default: {
    use: vi.fn(),
    launch: vi.fn(async () => {
      const browser = createMockBrowser();
      return browser;
    }),
  },
}));

vi.mock('../../../lib/services/extractor/botPrevention.js', () => ({
  getPreLaunchConfig: () => ({
    langArg: '--lang=en',
    windowSizeArg: '--window-size=1920,1080',
    extraArgs: [],
  }),
  applyBotPreventionToPage: vi.fn(),
  applyLanguagePersistence: vi.fn(),
  applyPostNavigationHumanSignals: vi.fn(),
}));

vi.mock('../../../lib/services/extractor/utils.js', () => ({
  debug: vi.fn(),
  botDetected: () => false,
}));

vi.mock('../../../lib/services/logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('fs', () => ({
  default: {
    mkdtempSync: () => '/tmp/puppeteer-fredy-test',
    promises: { rm: vi.fn() },
  },
  mkdtempSync: () => '/tmp/puppeteer-fredy-test',
  promises: { rm: vi.fn() },
}));

vi.mock('../../../lib/services/http/httpClient.js', async () => {
  const actual = {
    parseProxyUrl(proxyUrlString) {
      const url = new URL(proxyUrlString);
      const username = url.username || null;
      const password = url.password || null;
      url.username = '';
      url.password = '';
      const serverUrl = url.toString().replace(/\/$/, '');
      return { serverUrl, username, password };
    },
  };
  return actual;
});

const puppeteer = (await import('puppeteer-extra')).default;
const { launchBrowser } = await import('../../../lib/services/extractor/puppeteerExtractor.js');
const execute = (await import('../../../lib/services/extractor/puppeteerExtractor.js')).default;

describe('puppeteerExtractor proxy support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    launchCalls = [];
    puppeteer.launch.mockImplementation(async (opts) => {
      launchCalls.push(opts);
      return createMockBrowser();
    });
  });

  describe('launchBrowser', () => {
    it('adds --proxy-server arg when options.proxyUrl provided', async () => {
      await launchBrowser('https://example.com', { proxyUrl: 'http://proxy:8080' });

      const args = launchCalls[0].args;
      expect(args).toContain('--proxy-server=http://proxy:8080');
    });

    it('strips auth from --proxy-server arg', async () => {
      await launchBrowser('https://example.com', { proxyUrl: 'http://user:pass@proxy:8080' });

      const args = launchCalls[0].args;
      const proxyArg = args.find((a) => a.startsWith('--proxy-server='));
      expect(proxyArg).toBe('--proxy-server=http://proxy:8080');
    });

    it('stores __fredy_proxyAuth on browser with decoded credentials', async () => {
      const browser = await launchBrowser('https://example.com', { proxyUrl: 'http://user:pass@proxy:8080' });

      expect(browser.__fredy_proxyAuth).toEqual({
        username: 'user',
        password: 'pass',
      });
    });

    it('decodes URL-encoded credentials', async () => {
      const browser = await launchBrowser('https://example.com', {
        proxyUrl: 'http://user%40mail:p%23ss@proxy:8080',
      });

      expect(browser.__fredy_proxyAuth).toEqual({
        username: 'user@mail',
        password: 'p#ss',
      });
    });

    it('sets __fredy_proxyAuth to null when proxy has no auth', async () => {
      const browser = await launchBrowser('https://example.com', { proxyUrl: 'http://proxy:8080' });

      expect(browser.__fredy_proxyAuth).toBeNull();
    });

    it('does not add --proxy-server when no proxyUrl in options', async () => {
      await launchBrowser('https://example.com', {});

      const args = launchCalls[0].args;
      const proxyArg = args.find((a) => a.startsWith('--proxy-server='));
      expect(proxyArg).toBeUndefined();
    });
  });

  describe('execute proxy auth', () => {
    it('calls page.authenticate() when proxyUrl with auth is provided', async () => {
      await execute('https://example.com', null, { proxyUrl: 'http://u:p@proxy:8080' });

      expect(mockPage.authenticate).toHaveBeenCalledWith({ username: 'u', password: 'p' });
    });

    it('does not call page.authenticate() when proxyUrl has no auth', async () => {
      await execute('https://example.com', null, { proxyUrl: 'http://proxy:8080' });

      expect(mockPage.authenticate).not.toHaveBeenCalled();
    });

    it('calls page.authenticate() when using external browser with proxyAuth', async () => {
      const externalBrowser = createMockBrowser();
      externalBrowser.__fredy_proxyAuth = { username: 'ext', password: 'auth' };

      await execute('https://example.com', null, { browser: externalBrowser });

      expect(mockPage.authenticate).toHaveBeenCalledWith({ username: 'ext', password: 'auth' });
    });

    it('does not call page.authenticate() when external browser has no proxyAuth', async () => {
      const externalBrowser = createMockBrowser();

      await execute('https://example.com', null, { browser: externalBrowser });

      expect(mockPage.authenticate).not.toHaveBeenCalled();
    });
  });
});
