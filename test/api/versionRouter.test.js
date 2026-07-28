/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Every app boot hits this endpoint, and it in turn hits the unauthenticated GitHub API - 60
 * requests per hour per address. Without a cache a few users reloading exhausts the quota, and the
 * rate-limit body (which has no tag_name) used to make semver throw a 500 out of the handler.
 */
describe('GET /api/version', () => {
  let fetchMock;
  let handler;

  beforeEach(async () => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.resetModules();
    vi.doMock('node-fetch', () => ({ default: (...args) => fetchMock(...args) }));
    vi.doMock('../../lib/utils.js', () => ({ getPackageVersion: async () => '23.2.3' }));
    vi.doMock('../../lib/services/logger.js', () => ({
      default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));

    const plugin = (await import('../../lib/api/routes/versionRouter.js')).default;
    const routes = {};
    await plugin({ get: (path, h) => (routes[`GET ${path}`] = h) });
    handler = routes['GET /'];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const githubReturns = (body) => fetchMock.mockResolvedValue({ json: async () => body });

  it('reports a newer release', async () => {
    githubReturns({ tag_name: '24.0.0', html_url: 'https://example/rel', body: 'notes' });
    const result = await handler();
    expect(result).toMatchObject({ newVersion: true, version: '24.0.0', localFredyVersion: '23.2.3' });
  });

  it('reports no update when the local version is current', async () => {
    githubReturns({ tag_name: '23.2.3' });
    expect(await handler()).toEqual({ newVersion: false, localFredyVersion: '23.2.3' });
  });

  it('calls GitHub once across many requests', async () => {
    githubReturns({ tag_name: '24.0.0', html_url: 'https://example/rel', body: 'notes' });
    for (let i = 0; i < 5; i++) await handler();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks again after the two hour window', async () => {
    githubReturns({ tag_name: '24.0.0', html_url: 'https://example/rel', body: 'notes' });
    await handler();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1);
    await handler();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not throw on a rate-limit body without tag_name', async () => {
    githubReturns({ message: 'API rate limit exceeded for 1.2.3.4', documentation_url: 'https://docs' });
    expect(await handler()).toEqual({ newVersion: false, localFredyVersion: '23.2.3' });
  });

  it('caches the rate-limited answer instead of hammering GitHub', async () => {
    githubReturns({ message: 'API rate limit exceeded' });
    await handler();
    await handler();
    await handler();
    // Retrying while being rate-limited is exactly the wrong response.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('survives a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await handler()).toEqual({ newVersion: false, localFredyVersion: '23.2.3' });
  });
});
