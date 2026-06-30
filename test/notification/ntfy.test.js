/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external deps BEFORE importing the module under test.
vi.mock('node-fetch', () => ({ default: vi.fn() }));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  getJob: (jobKey) => ({ id: jobKey, name: jobKey }),
}));
vi.mock('../../lib/services/markdown.js', () => ({
  markdown2Html: () => '',
}));

function ok(body = 'ok') {
  return {
    ok: true,
    status: 200,
    text: async () => body,
  };
}

let mockNodeFetch;
let send;
let buildAuthorizationHeader;

const listing = {
  id: '1',
  title: 'Flat',
  link: 'https://example.com/a',
  address: 'Berlin',
  price: '800€',
  size: '50m²',
  image: null,
};

function configWith(fields) {
  return [{ id: 'ntfy', fields: { server: 'https://ntfy.sh', topic: 'mytopic', priority: 3, ...fields } }];
}

beforeEach(async () => {
  vi.resetModules();
  const nodeFetchMod = await import('node-fetch');
  mockNodeFetch = nodeFetchMod.default;
  mockNodeFetch.mockReset();
  mockNodeFetch.mockResolvedValue(ok());

  ({ send, buildAuthorizationHeader } = await import('../../lib/notification/adapter/ntfy.js'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ntfy buildAuthorizationHeader()', () => {
  it('returns null when no credentials are provided', () => {
    expect(buildAuthorizationHeader({})).toBeNull();
    expect(buildAuthorizationHeader()).toBeNull();
    expect(buildAuthorizationHeader({ username: '   ', accessToken: '  ' })).toBeNull();
  });

  it('builds a Bearer header from an access token', () => {
    expect(buildAuthorizationHeader({ accessToken: 'tk_secret' })).toBe('Bearer tk_secret');
    expect(buildAuthorizationHeader({ accessToken: '  tk_secret  ' })).toBe('Bearer tk_secret');
  });

  it('builds a Basic header from username/password', () => {
    const expected = `Basic ${Buffer.from('user:pass').toString('base64')}`;
    expect(buildAuthorizationHeader({ username: 'user', password: 'pass' })).toBe(expected);
  });

  it('encodes basic auth with an empty password', () => {
    const expected = `Basic ${Buffer.from('user:').toString('base64')}`;
    expect(buildAuthorizationHeader({ username: 'user' })).toBe(expected);
  });

  it('prefers the access token over basic auth when both are present', () => {
    expect(buildAuthorizationHeader({ accessToken: 'tk_secret', username: 'user', password: 'pass' })).toBe(
      'Bearer tk_secret',
    );
  });
});

describe('ntfy send() - authentication header', () => {
  it('sends no Authorization header when no credentials are configured', async () => {
    await send({
      serviceName: 'immoscout',
      newListings: [listing],
      notificationConfig: configWith({}),
      jobKey: 'Berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockNodeFetch.mock.calls[0];
    expect(url).toBe('https://ntfy.sh/mytopic');
    expect(opts.headers.Authorization).toBeUndefined();
  });

  it('sends a Bearer Authorization header when an access token is configured', async () => {
    await send({
      serviceName: 'immoscout',
      newListings: [listing],
      notificationConfig: configWith({ accessToken: 'tk_secret' }),
      jobKey: 'Berlin',
    });

    const [, opts] = mockNodeFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer tk_secret');
  });

  it('sends a Basic Authorization header when username/password are configured', async () => {
    await send({
      serviceName: 'immoscout',
      newListings: [listing],
      notificationConfig: configWith({ username: 'user', password: 'pass' }),
      jobKey: 'Berlin',
    });

    const [, opts] = mockNodeFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
  });
});

describe('ntfy send() - header encoding', () => {
  it('keeps plain ASCII titles untouched', async () => {
    await send({
      serviceName: 'immoscout',
      newListings: [{ ...listing, title: 'Nice Flat' }],
      notificationConfig: configWith({}),
      jobKey: 'Berlin',
    });

    const [, opts] = mockNodeFetch.mock.calls[0];
    expect(opts.headers.Title).toBe('Nice Flat');
  });

  it('encodes German Umlauts in the title as an RFC 2047 encoded-word instead of stripping them', async () => {
    const title = 'Großzügige Wohnung';
    await send({
      serviceName: 'immoscout',
      newListings: [{ ...listing, title }],
      notificationConfig: configWith({}),
      jobKey: 'Berlin',
    });

    const [, opts] = mockNodeFetch.mock.calls[0];
    const expected = `=?UTF-8?B?${Buffer.from(title, 'utf-8').toString('base64')}?=`;
    expect(opts.headers.Title).toBe(expected);
    // Round-trip: decoding the base64 payload must yield the original Umlauts.
    const payload = opts.headers.Title.replace(/^=\?UTF-8\?B\?/, '').replace(/\?=$/, '');
    expect(Buffer.from(payload, 'base64').toString('utf-8')).toBe(title);
  });
});

describe('ntfy send() - error handling', () => {
  it('rejects when the server responds with a non-ok status (e.g. 403)', async () => {
    mockNodeFetch.mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' });

    await expect(
      send({
        serviceName: 'immoscout',
        newListings: [listing],
        notificationConfig: configWith({}),
        jobKey: 'Berlin',
      }),
    ).rejects.toThrow(/Status code: 403/);
  });
});
