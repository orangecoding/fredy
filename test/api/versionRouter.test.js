/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * @param {string} tag
 * @param {Object} [overrides]
 * @returns {Object} A release as the GitHub list endpoint returns it.
 */
function release(tag, overrides = {}) {
  return {
    tag_name: tag,
    html_url: `https://example/rel/${tag}`,
    body: `notes for ${tag}`,
    published_at: '2026-01-01T00:00:00Z',
    draft: false,
    prerelease: false,
    ...overrides,
  };
}

/**
 * Every app boot hits these endpoints, and they in turn hit the unauthenticated GitHub API - 60
 * requests per hour per address. Without a cache a few users reloading exhausts the quota, and the
 * rate-limit body (which is no release list) used to make semver throw a 500 out of the handler.
 */
describe('GET /api/version', () => {
  let fetchMock;
  let handler;
  let releasesHandler;

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
    releasesHandler = routes['GET /releases'];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const githubReturns = (body) => fetchMock.mockResolvedValue({ json: async () => body });

  it('reports a newer release, in the same shape the news get', async () => {
    githubReturns([release('24.0.0', { body: '### Fixes\n- one' }), release('23.2.3')]);
    const result = await handler();
    expect(result).toMatchObject({
      newVersion: true,
      version: '24.0.0',
      date: '2026-01-01T00:00:00Z',
      url: 'https://example/rel/24.0.0',
      outline: [{ title: 'Fixes', items: 1 }],
      localFredyVersion: '23.2.3',
    });
  });

  it('judges by version, not by the order GitHub lists them in', async () => {
    githubReturns([release('23.1.0'), release('24.0.0')]);
    expect((await handler()).version).toBe('24.0.0');
  });

  it('does not offer a prerelease or a draft as the update', async () => {
    githubReturns([release('25.0.0', { prerelease: true }), release('24.1.0', { draft: true }), release('24.0.0')]);
    expect((await handler()).version).toBe('24.0.0');
  });

  // #465: the frontend used to compile the release body as MDX, where GitHub's unclosed <img>
  // is an unterminated JSX element - the compile threw and the changelog modal stayed empty.
  it('ships the release notes as rendered html, images included', async () => {
    githubReturns([
      release('24.0.0', { body: '# Notes\r\n\r\n<img alt="shot" src="https://github.com/user-attachments/assets/x">' }),
    ]);
    const result = await handler();
    expect(result.bodyHtml).toContain('<h1>Notes</h1>');
    expect(result.bodyHtml).toContain('src="https://github.com/user-attachments/assets/x"');
  });

  it('does not choke on a release published without a body', async () => {
    githubReturns([release('24.0.0', { body: null })]);
    expect((await handler()).bodyHtml).toBe('');
  });

  it('reports no update when the local version is current, and that it was checked', async () => {
    githubReturns([release('23.2.3')]);
    expect(await handler()).toEqual({ newVersion: false, checked: true, localFredyVersion: '23.2.3' });
  });

  it('calls GitHub once across many requests to both routes', async () => {
    githubReturns([release('24.0.0')]);
    for (let i = 0; i < 5; i++) {
      await handler();
      await releasesHandler();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks again after the two hour window', async () => {
    githubReturns([release('24.0.0')]);
    await handler();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1);
    await handler();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not throw on a rate-limit body', async () => {
    githubReturns({ message: 'API rate limit exceeded for 1.2.3.4', documentation_url: 'https://docs' });
    expect(await handler()).toEqual({ newVersion: false, localFredyVersion: '23.2.3' });
    expect(await releasesHandler()).toEqual([]);
  });

  it('caches the rate-limited answer instead of hammering GitHub', async () => {
    githubReturns({ message: 'API rate limit exceeded' });
    await handler();
    await handler();
    await releasesHandler();
    // Retrying while being rate-limited is exactly the wrong response.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('survives a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await handler()).toEqual({ newVersion: false, localFredyVersion: '23.2.3' });
    expect(await releasesHandler()).toEqual([]);
  });

  it('skips tags that are not versions instead of throwing on them', async () => {
    githubReturns([release('nightly'), release('24.0.0'), release('23.2.3')]);
    expect((await handler()).version).toBe('24.0.0');
    expect((await releasesHandler()).map((entry) => entry.version)).toEqual(['23.2.3']);
  });
});

describe('GET /api/version/releases', () => {
  let fetchMock;
  let releasesHandler;

  beforeEach(async () => {
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
    releasesHandler = routes['GET /releases'];
  });

  const githubReturns = (body) => fetchMock.mockResolvedValue({ json: async () => body });

  it('lists only what is installed, newest first', async () => {
    githubReturns([release('24.0.0'), release('23.1.0'), release('23.2.3'), release('23.2.0')]);
    expect((await releasesHandler()).map((entry) => entry.version)).toEqual(['23.2.3', '23.2.0', '23.1.0']);
  });

  it('leaves out drafts and prereleases', async () => {
    githubReturns([
      release('23.2.3', { draft: true }),
      release('23.2.2', { prerelease: true }),
      release('23.2.1-pre.1', { prerelease: true }),
      release('23.2.0'),
    ]);
    expect((await releasesHandler()).map((entry) => entry.version)).toEqual(['23.2.0']);
  });

  it('lists the six newest, not the whole history', async () => {
    githubReturns(
      ['23.2.3', '23.2.2', '23.2.1', '23.2.0', '23.1.1', '23.1.0', '23.0.0', '22.0.0'].map((tag) => release(tag)),
    );
    const versions = (await releasesHandler()).map((entry) => entry.version);
    expect(versions).toEqual(['23.2.3', '23.2.2', '23.2.1', '23.2.0', '23.1.1', '23.1.0']);
  });

  it('hands over the notes rendered, with the publish date, the page and the outline', async () => {
    githubReturns([release('23.2.3', { body: '## Hello\n- one\n- two', published_at: '2026-10-27T12:41:38Z' })]);
    expect(await releasesHandler()).toEqual([
      {
        version: '23.2.3',
        date: '2026-10-27T12:41:38Z',
        url: 'https://example/rel/23.2.3',
        bodyHtml: '<h2>Hello</h2>\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n',
        outline: [{ title: 'Hello', items: 2 }],
      },
    ]);
  });
});
