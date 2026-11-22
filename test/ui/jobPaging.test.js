/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JITTER_SECONDS,
  DEFAULT_WAIT_SECONDS,
  MAX_PAGES,
  MAX_WAIT_SECONDS,
  withPagingChange,
} from '../../ui/src/services/jobs/paging.js';
import * as server from '../../lib/utils/paging.js';

describe('withPagingChange', () => {
  it('offers the default wait and jitter the moment the count is raised', () => {
    expect(withPagingChange(null, { pages: 2 })).toEqual({
      pages: 2,
      waitSeconds: DEFAULT_WAIT_SECONDS,
      jitterSeconds: DEFAULT_JITTER_SECONDS,
    });
  });

  it('keeps the wait the user chose when the count changes', () => {
    const current = { pages: 2, waitSeconds: 90, jitterSeconds: 10 };
    expect(withPagingChange(current, { pages: 4 })).toEqual({ pages: 4, waitSeconds: 90, jitterSeconds: 10 });
  });

  it('clears everything once the count is back at one page, or emptied', () => {
    const current = { pages: 3, waitSeconds: 90, jitterSeconds: 10 };
    expect(withPagingChange(current, { pages: 1 })).toBeNull();
    expect(withPagingChange(current, { pages: '' })).toBeNull();
  });

  it('keeps the count and both pauses within bounds', () => {
    expect(withPagingChange(null, { pages: 99, waitSeconds: 9_999, jitterSeconds: -3 })).toEqual({
      pages: MAX_PAGES,
      waitSeconds: MAX_WAIT_SECONDS,
      jitterSeconds: 0,
    });
  });

  it('uses the same bounds as the server', () => {
    expect(MAX_PAGES).toBe(server.MAX_PAGES);
    expect(MAX_WAIT_SECONDS).toBe(server.MAX_WAIT_SECONDS);
  });
});
