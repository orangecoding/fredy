/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import logger from '../../lib/services/logger.js';
import { config } from '../../lib/provider/immoscout.js';

/**
 * The mobile API does not refuse a User-Agent it does not accept with an error status. It answers
 * 200 with an empty text/html body, and parsing that used to throw a bare JSON error on every run.
 */
const SEARCH_URL =
  'https://api.mobile.immobilienscout24.de/search/list?geocodes=%2Fde%2Fberlin%2Fberlin&realestatetype=apartmentrent&searchType=region';

beforeEach(() => {
  vi.mocked(logger.error).mockClear();
  vi.stubGlobal(
    'fetch',
    async () => new Response('', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('immoscout search answered without JSON', () => {
  it('finds nothing instead of throwing', async () => {
    await expect(config.getListings(SEARCH_URL)).resolves.toEqual([]);
  });

  it('logs that the User-Agent was probably refused', async () => {
    await config.getListings(SEARCH_URL);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0]).toContain('User-Agent');
  });
});
