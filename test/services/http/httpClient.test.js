/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const { mockState, proxyAgentInstance, ProxyAgentMock } = vi.hoisted(() => {
  const mockState = { settings: {} };
  const proxyAgentInstance = { type: 'mock-proxy-agent' };
  const ProxyAgentMock = vi.fn(function () {
    return proxyAgentInstance;
  });
  return { mockState, proxyAgentInstance, ProxyAgentMock };
});

vi.mock('undici', () => ({
  ProxyAgent: ProxyAgentMock,
}));

vi.mock('../../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: () => mockState.settings,
}));

const { parseProxyUrl, scrapingFetch, getProxyConfig, clearProxyCache } =
  await import('../../../lib/services/http/httpClient.js');

describe('httpClient', () => {
  const originalEnv = { ...process.env };
  let mockFetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.FREDY_PROXY_URL;
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;

    mockState.settings = {};
    ProxyAgentMock.mockClear();
    clearProxyCache();

    mockFetch = vi.fn(() => Promise.resolve(new Response('ok')));
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  describe('parseProxyUrl', () => {
    it('parses HTTP proxy without auth', () => {
      const result = parseProxyUrl('http://proxy.example.com:8080');
      expect(result).toEqual({
        serverUrl: 'http://proxy.example.com:8080',
        username: null,
        password: null,
      });
    });

    it('parses HTTPS proxy without auth', () => {
      const result = parseProxyUrl('https://proxy.example.com:8443');
      expect(result).toEqual({
        serverUrl: 'https://proxy.example.com:8443',
        username: null,
        password: null,
      });
    });

    it('parses proxy with auth', () => {
      const result = parseProxyUrl('http://user:pass@proxy.example.com:8080');
      expect(result).toEqual({
        serverUrl: 'http://proxy.example.com:8080',
        username: 'user',
        password: 'pass',
      });
    });

    it('parses proxy with URL-encoded auth', () => {
      const result = parseProxyUrl('http://user%40mail:p%23ss@host:8080');
      expect(result).toEqual({
        serverUrl: 'http://host:8080',
        username: 'user%40mail',
        password: 'p%23ss',
      });
    });

    it('parses proxy without explicit port', () => {
      const result = parseProxyUrl('http://proxy.example.com');
      expect(result).toEqual({
        serverUrl: 'http://proxy.example.com',
        username: null,
        password: null,
      });
    });
  });

  describe('scrapingFetch', () => {
    it('calls fetch without dispatcher when no proxy configured', async () => {
      await scrapingFetch('https://example.com');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com', {});
      expect(ProxyAgentMock).not.toHaveBeenCalled();
    });

    it('creates ProxyAgent and passes as dispatcher when proxy URL set', async () => {
      mockState.settings = { proxyUrl: 'http://proxy:8080' };

      await scrapingFetch('https://example.com');

      expect(ProxyAgentMock).toHaveBeenCalledWith({ uri: 'http://proxy:8080' });
      expect(mockFetch).toHaveBeenCalledWith('https://example.com', {
        dispatcher: proxyAgentInstance,
      });
    });

    it('passes Basic auth token to ProxyAgent for authenticated proxies', async () => {
      mockState.settings = { proxyUrl: 'http://user:pass@proxy:8080' };

      await scrapingFetch('https://example.com');

      expect(ProxyAgentMock).toHaveBeenCalledWith({
        uri: 'http://proxy:8080',
        token: `Basic ${Buffer.from('user:pass').toString('base64')}`,
      });
    });

    it('caches ProxyAgent across calls', async () => {
      mockState.settings = { proxyUrl: 'http://proxy:8080' };

      await scrapingFetch('https://example.com/1');
      await scrapingFetch('https://example.com/2');

      expect(ProxyAgentMock).toHaveBeenCalledTimes(1);
    });

    it('creates new ProxyAgent after clearProxyCache', async () => {
      mockState.settings = { proxyUrl: 'http://proxy:8080' };

      await scrapingFetch('https://example.com');
      expect(ProxyAgentMock).toHaveBeenCalledTimes(1);

      clearProxyCache();

      await scrapingFetch('https://example.com');
      expect(ProxyAgentMock).toHaveBeenCalledTimes(2);
    });

    it('falls back to FREDY_PROXY_URL env var', async () => {
      process.env.FREDY_PROXY_URL = 'http://env-proxy:9090';

      await scrapingFetch('https://example.com');

      expect(ProxyAgentMock).toHaveBeenCalledWith({ uri: 'http://env-proxy:9090' });
    });

    it('falls back to HTTPS_PROXY env var', async () => {
      process.env.HTTPS_PROXY = 'http://https-proxy:9090';

      await scrapingFetch('https://example.com');

      expect(ProxyAgentMock).toHaveBeenCalledWith({ uri: 'http://https-proxy:9090' });
    });

    it('falls back to HTTP_PROXY env var', async () => {
      process.env.HTTP_PROXY = 'http://http-proxy:9090';

      await scrapingFetch('https://example.com');

      expect(ProxyAgentMock).toHaveBeenCalledWith({ uri: 'http://http-proxy:9090' });
    });

    it('settings value takes priority over all env vars', async () => {
      mockState.settings = { proxyUrl: 'http://settings-proxy:8080' };
      process.env.FREDY_PROXY_URL = 'http://env-proxy:9090';
      process.env.HTTPS_PROXY = 'http://https-proxy:9090';
      process.env.HTTP_PROXY = 'http://http-proxy:9090';

      await scrapingFetch('https://example.com');

      expect(ProxyAgentMock).toHaveBeenCalledWith({ uri: 'http://settings-proxy:8080' });
    });

    it('FREDY_PROXY_URL takes priority over HTTPS_PROXY and HTTP_PROXY', async () => {
      process.env.FREDY_PROXY_URL = 'http://fredy-proxy:9090';
      process.env.HTTPS_PROXY = 'http://https-proxy:9090';
      process.env.HTTP_PROXY = 'http://http-proxy:9090';

      await scrapingFetch('https://example.com');

      expect(ProxyAgentMock).toHaveBeenCalledWith({ uri: 'http://fredy-proxy:9090' });
    });

    it('passes through all fetch options', async () => {
      mockState.settings = { proxyUrl: 'http://proxy:8080' };

      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"key":"value"}',
        redirect: 'manual',
      };

      await scrapingFetch('https://example.com', options);

      expect(mockFetch).toHaveBeenCalledWith('https://example.com', {
        ...options,
        dispatcher: proxyAgentInstance,
      });
    });
  });

  describe('getProxyConfig', () => {
    it('returns proxy config with auth when proxy URL has credentials', () => {
      mockState.settings = { proxyUrl: 'http://user:pass@proxy:8080' };

      const config = getProxyConfig();

      expect(config).toEqual({
        rawUrl: 'http://user:pass@proxy:8080',
        proxyUrl: 'http://proxy:8080',
        auth: { username: 'user', password: 'pass' },
      });
    });

    it('returns proxy config without auth when proxy URL has no credentials', () => {
      mockState.settings = { proxyUrl: 'http://proxy:8080' };

      const config = getProxyConfig();

      expect(config).toEqual({
        rawUrl: 'http://proxy:8080',
        proxyUrl: 'http://proxy:8080',
        auth: null,
      });
    });

    it('returns null when no proxy configured', () => {
      const config = getProxyConfig();

      expect(config).toBeNull();
    });

    it('decodes URL-encoded credentials in auth', () => {
      mockState.settings = { proxyUrl: 'http://user%40mail:p%23ss@proxy:8080' };

      const config = getProxyConfig();

      expect(config).toEqual({
        rawUrl: 'http://user%40mail:p%23ss@proxy:8080',
        proxyUrl: 'http://proxy:8080',
        auth: { username: 'user@mail', password: 'p#ss' },
      });
    });

    it('falls back to env vars when no settings', () => {
      process.env.FREDY_PROXY_URL = 'http://env-proxy:9090';

      const config = getProxyConfig();

      expect(config).toEqual({
        rawUrl: 'http://env-proxy:9090',
        proxyUrl: 'http://env-proxy:9090',
        auth: null,
      });
    });
  });

  describe('clearProxyCache', () => {
    it('clears cached agent so next call creates new one', async () => {
      mockState.settings = { proxyUrl: 'http://proxy:8080' };

      await scrapingFetch('https://example.com');
      expect(ProxyAgentMock).toHaveBeenCalledTimes(1);

      clearProxyCache();

      await scrapingFetch('https://example.com');
      expect(ProxyAgentMock).toHaveBeenCalledTimes(2);
    });
  });
});
