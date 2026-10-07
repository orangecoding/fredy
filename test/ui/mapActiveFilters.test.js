/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { countActiveMapFilters } from '../../ui/src/views/listings/mapUtils.js';

const none = { jobId: null, commute: null, priceMin: null, priceMax: null };

describe('countActiveMapFilters', () => {
  it('counts nothing on a pristine map', () => {
    expect(countActiveMapFilters(none)).toBe(0);
  });

  it('counts a selected job', () => {
    expect(countActiveMapFilters({ ...none, jobId: 'job-1' })).toBe(1);
  });

  it('counts a commute ceiling', () => {
    expect(countActiveMapFilters({ ...none, commute: 'transit:30' })).toBe(1);
  });

  it('ignores a commute value that hides nothing, such as a mangled bookmark', () => {
    expect(countActiveMapFilters({ ...none, commute: 'teleport:30' })).toBe(0);
    expect(countActiveMapFilters({ ...none, commute: 'transit:' })).toBe(0);
  });

  it('counts a price floor or a price ceiling as one filter, and both together still as one', () => {
    expect(countActiveMapFilters({ ...none, priceMin: 300000 })).toBe(1);
    expect(countActiveMapFilters({ ...none, priceMax: 450000 })).toBe(1);
    expect(countActiveMapFilters({ ...none, priceMin: 300000, priceMax: 450000 })).toBe(1);
  });

  it('does not count a price bound that narrows nothing', () => {
    expect(countActiveMapFilters({ ...none, priceMin: 0 })).toBe(0);
    expect(countActiveMapFilters({ ...none, priceMin: Number.NaN, priceMax: Number.NaN })).toBe(0);
  });

  it('adds them up', () => {
    expect(countActiveMapFilters({ jobId: 'job-1', commute: 'car:15', priceMin: 1000, priceMax: null })).toBe(3);
  });
});
