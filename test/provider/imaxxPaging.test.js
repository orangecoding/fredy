/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../lib/provider/imaxx.js';

const SEARCH = 'https://www.imaxx.de/immobilien/?post_type=immomakler_object&im_order=datedesc';
const fixture = readFileSync(new URL('../testFixtures/imaxx.html', import.meta.url), 'utf8');

afterEach(() => vi.unstubAllGlobals());

describe('imaxx paging', () => {
  it('reads a later page with a plain request that refuses redirects', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(fixture, { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    const raw = await config.getListings(config.pageUrl(SEARCH, 2), undefined);
    expect(raw.length).toBeGreaterThan(0);
    expect(fetch.mock.calls[0][0]).toBe(
      'https://www.imaxx.de/immobilien/page/2/?post_type=immomakler_object&im_order=datedesc',
    );
    expect(fetch.mock.calls[0][1].redirect).toBe('manual');
  });

  // Past the last page imaxx redirects to its whole property list, every filter dropped.
  it('reads a later page that redirects as empty instead of following it', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 301, headers: { location: 'https://www.imaxx.de/immobilien/' } }),
        ),
    );
    expect(await config.getListings(config.pageUrl(SEARCH, 15), undefined)).toEqual([]);
  });
});
