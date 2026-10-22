/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  getJob: (id) => (id === 'known' ? { id: 'known', name: 'Düsseldorf' } : null),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({ getUserSettings: () => ({}) }));

const { normalizeListingFilters } = await import('../../lib/api/listingFilterQuery.js');

describe('a job filter on a job that is gone', () => {
  it('filters on a known job by its id', () => {
    expect(normalizeListingFilters({ jobNameFilter: 'known' }, { userId: 'u1' }).filters.jobIdFilter).toBe('known');
  });

  // Dropping the filter widened the query to every job, and a bulk delete from a page still
  // filtered on a deleted job removed listings across all of the user's jobs.
  it('keeps the filter, so it matches nothing instead of everything', () => {
    expect(normalizeListingFilters({ jobNameFilter: 'deleted-job' }, { userId: 'u1' }).filters.jobIdFilter).toBe(
      'deleted-job',
    );
  });

  it('adds no job filter when none was asked for', () => {
    expect(normalizeListingFilters({}, { userId: 'u1' }).filters.jobIdFilter).toBeNull();
  });
});
