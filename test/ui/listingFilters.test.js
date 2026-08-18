/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  NEUTRAL,
  FILTER_KEYS,
  isActiveFilter,
  countActiveFilters,
  showValueOf,
  showPatch,
  clearFilter,
  clearAllFilters,
  describeActiveFilters,
  filterConfiguredProviders,
} from '../../ui/src/services/listings/listingFilters.js';

/** The URL state as the page opens it. @returns {Object} */
const defaults = () => ({
  page: 1,
  sort: 'created_at',
  dir: 'desc',
  q: null,
  ...NEUTRAL,
  // The page opens filtered to active listings, which is the one default that is a real filter.
  active: true,
});

/** A `t` that returns the key, so assertions read as the key rather than as English. */
const t = (key, vars) => (vars == null ? key : `${key}:${JSON.stringify(vars)}`);

describe('listingFilters', () => {
  describe('counting', () => {
    it('counts the opening view as filtered, because it is', () => {
      expect(countActiveFilters(defaults())).toBe(1);
      expect(isActiveFilter('active', defaults())).toBe(true);
    });

    it('counts nothing once everything is cleared', () => {
      const cleared = clearAllFilters();
      expect(cleared.active).toBe(null);
      expect(countActiveFilters({ ...defaults(), ...cleared })).toBe(0);
    });

    it('counts each filter once', () => {
      const values = { ...defaults(), provider: 'immoscout', status: 'applied', watch: true };
      expect(countActiveFilters(values)).toBe(4);
    });

    it('does not count activity twice while the hidden view is on', () => {
      // `hidden` forces `active` to null, so the pair is one control and reads as one filter.
      const values = { ...defaults(), ...showPatch('hidden') };
      expect(countActiveFilters(values)).toBe(1);
      expect(isActiveFilter('active', values)).toBe(false);
    });
  });

  describe('the activity control', () => {
    it.each([
      ['all', { hidden: false, active: null }],
      ['true', { hidden: false, active: true }],
      ['false', { hidden: false, active: false }],
      ['hidden', { hidden: true, active: null }],
    ])('round-trips %s', (value, expected) => {
      const patch = showPatch(value);
      expect(patch).toMatchObject(expected);
      expect(showValueOf({ ...defaults(), ...patch })).toBe(value);
    });

    it('always resets the page, so a filtered view cannot open on a page that no longer exists', () => {
      for (const value of ['all', 'true', 'false', 'hidden']) {
        expect(showPatch(value).page).toBe(1);
      }
    });
  });

  describe('clearing', () => {
    it.each(FILTER_KEYS)('clears %s without disturbing the others', (key) => {
      const values = {
        ...defaults(),
        watch: true,
        job: 'job-1',
        provider: 'immoscout',
        status: 'applied',
        afford: 'stretch',
        commute: 'transit:30',
      };
      const next = { ...values, ...clearFilter(key) };

      expect(isActiveFilter(key, next)).toBe(false);
      for (const other of FILTER_KEYS) {
        // Activity and the hidden view are the one pair that clear together, by design.
        if (other === key || (key === 'active' && other === 'hidden') || (key === 'hidden' && other === 'active')) {
          continue;
        }
        expect(next[other]).toBe(values[other]);
      }
    });

    it('leaves the search box, the sort and the page size alone', () => {
      const patch = clearAllFilters();
      expect(patch.q).toBeUndefined();
      expect(patch.sort).toBeUndefined();
      expect(patch.dir).toBeUndefined();
    });

    it('sends the user back to the first page', () => {
      expect(clearAllFilters().page).toBe(1);
      expect(clearFilter('provider').page).toBe(1);
    });
  });

  describe('describing', () => {
    it('says nothing when nothing is on', () => {
      expect(describeActiveFilters({ ...defaults(), ...clearAllFilters() }, { t })).toEqual([]);
    });

    it('names the job and the provider rather than showing their ids', () => {
      const chips = describeActiveFilters(
        { ...defaults(), ...clearAllFilters(), job: 'job-1', provider: 'is24' },
        {
          t,
          jobs: [{ id: 'job-1', name: 'Cologne 3-room' }],
          providers: [{ id: 'is24', name: 'ImmoScout24' }],
        },
      );
      // Source last, in the reading order FILTER_KEYS declares.
      expect(chips).toEqual([
        { key: 'provider', label: 'ImmoScout24' },
        { key: 'job', label: 'Cologne 3-room' },
      ]);
    });

    it('lists chips in the declared reading order, not in the order the keys were set', () => {
      const values = { ...defaults(), job: 'j', provider: 'p', watch: true, status: 'applied' };
      expect(describeActiveFilters(values, { t }).map((chip) => chip.key)).toEqual([
        'active',
        'watch',
        'status',
        'provider',
        'job',
      ]);
    });

    it('falls back to the id when the job is gone', () => {
      const [chip] = describeActiveFilters({ ...defaults(), ...clearAllFilters(), job: 'deleted' }, { t, jobs: [] });
      expect(chip.label).toBe('deleted');
    });

    it('tells active and inactive apart', () => {
      expect(describeActiveFilters({ ...defaults(), active: true }, { t })[0].label).toBe('listings.filterActive');
      expect(describeActiveFilters({ ...defaults(), active: false }, { t })[0].label).toBe('listings.filterInactive');
    });

    it('tells watched and unwatched apart', () => {
      const base = { ...defaults(), ...clearAllFilters() };
      expect(describeActiveFilters({ ...base, watch: true }, { t })[0].label).toBe('listings.filterWatched');
      expect(describeActiveFilters({ ...base, watch: false }, { t })[0].label).toBe('listings.filterUnwatched');
    });

    it('spells out the commute rather than repeating its encoding', () => {
      const base = { ...defaults(), ...clearAllFilters() };
      const [chip] = describeActiveFilters({ ...base, commute: 'transit:30' }, { t });
      expect(chip.label).toContain('listings.filterCommuteOption');
      expect(chip.label).toContain('30');
      expect(chip.label).not.toBe('transit:30');
    });

    it('shows the hidden view as one chip, not two', () => {
      const values = { ...defaults(), ...showPatch('hidden') };
      expect(describeActiveFilters(values, { t })).toEqual([{ key: 'hidden', label: 'listings.filterHidden' }]);
    });

    it('produces one chip per counted filter', () => {
      const values = { ...defaults(), provider: 'is24', status: 'applied', watch: true };
      expect(describeActiveFilters(values, { t })).toHaveLength(countActiveFilters(values));
    });
  });

  describe('configured providers', () => {
    const allProviders = [
      { id: 'immoscout', name: 'ImmoScout24' },
      { id: 'immowelt', name: 'Immowelt' },
      { id: 'kleinanzeigen', name: 'Kleinanzeigen' },
      { id: 'wgGesucht', name: 'WG-Gesucht' },
    ];

    it('restricts providers to those present in configured jobs', () => {
      const jobs = [
        { id: 'j1', name: 'Job 1', provider: [{ id: 'immoscout' }] },
        { id: 'j2', name: 'Job 2', provider: [{ id: 'immowelt' }] },
      ];
      const result = filterConfiguredProviders(allProviders, jobs);
      expect(result).toEqual([
        { id: 'immoscout', name: 'ImmoScout24' },
        { id: 'immowelt', name: 'Immowelt' },
      ]);
    });

    it('narrows to the selected job when a job filter is active', () => {
      const jobs = [
        { id: 'j1', name: 'Job 1', provider: [{ id: 'immoscout' }] },
        { id: 'j2', name: 'Job 2', provider: [{ id: 'immowelt' }] },
      ];
      const result = filterConfiguredProviders(allProviders, jobs, 'j1');
      expect(result).toEqual([{ id: 'immoscout', name: 'ImmoScout24' }]);
    });

    it('preserves an active provider filter even if unconfigured in the current job', () => {
      const jobs = [{ id: 'j1', name: 'Job 1', provider: [{ id: 'immoscout' }] }];
      const result = filterConfiguredProviders(allProviders, jobs, 'j1', 'kleinanzeigen');
      expect(result).toEqual([
        { id: 'immoscout', name: 'ImmoScout24' },
        { id: 'kleinanzeigen', name: 'Kleinanzeigen' },
      ]);
    });

    it('falls back to all providers when no jobs exist', () => {
      expect(filterConfiguredProviders(allProviders, [])).toEqual(allProviders);
      expect(filterConfiguredProviders(allProviders, null)).toEqual(allProviders);
    });

    it('falls back to all providers when jobs have no configured providers', () => {
      const jobs = [{ id: 'j1', name: 'Job 1', provider: [] }];
      expect(filterConfiguredProviders(allProviders, jobs)).toEqual(allProviders);
    });

    it('handles empty or missing providers list safely', () => {
      expect(filterConfiguredProviders([], [{ id: 'j1' }])).toEqual([]);
      expect(filterConfiguredProviders(null, [{ id: 'j1' }])).toEqual([]);
    });
  });
});
