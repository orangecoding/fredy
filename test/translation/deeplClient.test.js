/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { translate } from '../../lib/services/translation/deeplClient.js';

const FREE_KEY = 'test-key:fx';
const PRO_KEY = 'test-key-pro';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

function makeResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 429 ? 'Too Many Requests' : 'Error',
    json: async () => body,
  };
}

describe('#deeplClient translate()', () => {
  it('returns translated text on successful response', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ translations: [{ text: 'Hello world' }] }));

    const result = await translate('Bonjour le monde', 'EN', FREE_KEY);

    expect(result).toBe('Hello world');
  });

  it('calls the free-tier URL for keys ending with :fx', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ translations: [{ text: 'Hello' }] }));

    await translate('Bonjour', 'EN', FREE_KEY);

    expect(mockFetch).toHaveBeenCalledWith('https://api-free.deepl.com/v2/translate', expect.any(Object));
  });

  it('calls the pro URL for keys not ending with :fx', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ translations: [{ text: 'Hello' }] }));

    await translate('Bonjour', 'EN', PRO_KEY);

    expect(mockFetch).toHaveBeenCalledWith('https://api.deepl.com/v2/translate', expect.any(Object));
  });

  it('sends the correct Authorization header and body', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ translations: [{ text: 'Hallo' }] }));

    await translate('Hello', 'DE', FREE_KEY);

    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe(`DeepL-Auth-Key ${FREE_KEY}`);
    const body = JSON.parse(options.body);
    expect(body.text).toEqual(['Hello']);
    expect(body.target_lang).toBe('DE');
    expect(body.source_lang).toBeUndefined();
  });

  it('throws with a rate-limit message on 429', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 429));

    await expect(translate('Bonjour', 'EN', FREE_KEY)).rejects.toThrow('rate limit');
  });

  it('throws on non-OK responses', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 403));

    await expect(translate('Bonjour', 'EN', FREE_KEY)).rejects.toThrow('DeepL API error: 403');
  });

  it('throws when response shape is unexpected', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ unexpected: true }));

    await expect(translate('Bonjour', 'EN', FREE_KEY)).rejects.toThrow('unexpected response shape');
  });
});
