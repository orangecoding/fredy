/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  NEUTRAL,
  FILTER_KEYS,
  isActiveFilter,
  countActiveFilters,
  clearFilter,
  clearAllFilters,
  describeActiveFilters,
} from '../../ui/src/services/jobs/jobFilters.js';
import * as listingFilters from '../../ui/src/services/listings/listingFilters.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const english = JSON.parse(fs.readFileSync(path.join(here, '../../ui/src/locales/en.json'), 'utf-8'));

const t = (key) => key;

describe('jobFilters', () => {
  it('counts an unfiltered jobs page as unfiltered', () => {
    // Unlike listings, the jobs page opens showing everything - so a fresh page has no chips and
    // an empty filter button.
    expect(countActiveFilters({ ...NEUTRAL })).toBe(0);
    expect(describeActiveFilters({ ...NEUTRAL }, { t })).toEqual([]);
  });

  it.each([
    [true, 'jobs.filterActive'],
    [false, 'jobs.filterInactive'],
  ])('names the %s filter', (active, expected) => {
    const values = { active };
    expect(countActiveFilters(values)).toBe(1);
    expect(describeActiveFilters(values, { t })).toEqual([{ key: 'active', label: expected }]);
  });

  it('clears back to showing everything, and returns to the first page', () => {
    expect(clearFilter('active')).toMatchObject({ active: null, page: 1 });
    expect(clearAllFilters()).toMatchObject({ active: null, page: 1 });
  });

  it('leaves the search box and the sort alone', () => {
    const patch = clearAllFilters();
    expect(patch.q).toBeUndefined();
    expect(patch.sort).toBeUndefined();
    expect(patch.dir).toBeUndefined();
  });

  it('translates every label it can produce', () => {
    for (const key of ['jobs.filterActive', 'jobs.filterInactive', 'jobs.filterAll', 'jobs.filterActivityHelp']) {
      expect(Object.keys(english)).toContain(key);
    }
  });

  it('exposes the same shape the listings filters do', () => {
    // The two pages share the drawer, the chips and the button. They can only do that while both
    // filter models answer the same questions in the same way.
    for (const name of [
      'NEUTRAL',
      'FILTER_KEYS',
      'isActiveFilter',
      'countActiveFilters',
      'clearFilter',
      'clearAllFilters',
      'describeActiveFilters',
    ]) {
      expect(listingFilters[name]).toBeDefined();
    }
    expect(FILTER_KEYS.every((key) => key in NEUTRAL)).toBe(true);
    expect(isActiveFilter('active', { active: true })).toBe(true);
  });
});
