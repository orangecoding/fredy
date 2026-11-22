/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { MAX_PAGES, MAX_WAIT_SECONDS, normalizePaging, pageDelayMs } from '../../lib/utils/paging.js';

describe('normalizePaging', () => {
  it.each([
    ['nothing', null],
    ['undefined', undefined],
    ['an array', [3]],
    ['a number', 3],
    ['one page', { pages: 1, waitSeconds: 30, jitterSeconds: 30 }],
    ['zero pages', { pages: 0 }],
    ['an unparseable count', { pages: 'many' }],
  ])('reads %s as one page', (_label, raw) => {
    expect(normalizePaging(raw)).toBeNull();
  });

  it('keeps a valid setting', () => {
    expect(normalizePaging({ pages: 3, waitSeconds: 30, jitterSeconds: 15 })).toEqual({
      pages: 3,
      waitSeconds: 30,
      jitterSeconds: 15,
    });
  });

  it('accepts numbers sent as strings, as a form may post them', () => {
    expect(normalizePaging({ pages: '2', waitSeconds: '45', jitterSeconds: '' })).toEqual({
      pages: 2,
      waitSeconds: 45,
      jitterSeconds: 0,
    });
  });

  it('caps the page count and both pauses', () => {
    expect(normalizePaging({ pages: 500, waitSeconds: 99_999, jitterSeconds: 99_999 })).toEqual({
      pages: MAX_PAGES,
      waitSeconds: MAX_WAIT_SECONDS,
      jitterSeconds: MAX_WAIT_SECONDS,
    });
  });

  it('reads a negative or missing pause as none', () => {
    expect(normalizePaging({ pages: 2, waitSeconds: -5 })).toEqual({ pages: 2, waitSeconds: 0, jitterSeconds: 0 });
  });
});

describe('pageDelayMs', () => {
  const paging = { pages: 2, waitSeconds: 30, jitterSeconds: 20 };

  it('waits at least the wait time', () => {
    expect(pageDelayMs(paging, () => 0)).toBe(30_000);
  });

  it('adds at most the jitter on top', () => {
    expect(pageDelayMs(paging, () => 1)).toBe(50_000);
    expect(pageDelayMs(paging, () => 0.5)).toBe(40_000);
  });
});
