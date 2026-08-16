/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  COMMUTE_ACTIONS,
  DEFAULT_COMMUTE_ACTION,
  countCommuteLimits,
  orphanedCommuteLabels,
  savedAddresses,
  toCommuteLimit,
} from '../../ui/src/services/jobs/commuteFilter.js';
import { describeJobRefinements } from '../../ui/src/services/jobs/jobSummary.js';

describe('commuteFilter', () => {
  describe('toCommuteLimit', () => {
    it('takes a whole number of minutes', () => {
      expect(toCommuteLimit(35)).toBe(35);
      expect(toCommuteLimit('35')).toBe(35);
      expect(toCommuteLimit(35.9)).toBe(35);
    });

    /**
     * Semi hands back an empty string on clear and a partial value mid-typing. Reading either as a
     * zero would turn "I changed my mind about this address" into a limit nothing can meet.
     */
    it('reads a cleared or half-typed field as no limit', () => {
      for (const value of ['', null, undefined, 0, -5, 'soon', NaN]) {
        expect(toCommuteLimit(value)).toBeNull();
      }
    });
  });

  describe('the offered actions', () => {
    it('runs least destructive first and defaults to holding back the notification', () => {
      expect(COMMUTE_ACTIONS).toEqual(['mark', 'notify', 'exclude']);
      expect(COMMUTE_ACTIONS).toContain(DEFAULT_COMMUTE_ACTION);
      expect(DEFAULT_COMMUTE_ACTION).toBe('notify');
    });
  });

  describe('countCommuteLimits', () => {
    it('counts the addresses a filter actually limits', () => {
      expect(countCommuteLimits({ limits: { Work: 35, School: 20 } })).toBe(2);
      expect(countCommuteLimits({ limits: {} })).toBe(0);
      expect(countCommuteLimits(null)).toBe(0);
      expect(countCommuteLimits({})).toBe(0);
    });
  });

  describe('savedAddresses', () => {
    /**
     * A failed geocode is stored as -1/-1 and the Settings page still lists the address. The form
     * has to agree with it: dropping the address here is what made the section warn that the user's
     * own address was gone and then clear the limit set on it.
     */
    it('keeps an address whose geocode came back empty', () => {
      const settings = {
        home_addresses: [
          { label: 'Work', coords: { lat: 52.5, lng: 13.4 } },
          { label: 'Not found yet', coords: { lat: -1, lng: -1 } },
        ],
      };
      expect(savedAddresses(settings).map((address) => address.label)).toEqual(['Work', 'Not found yet']);
    });

    it('has nothing to show without settings, and skips an entry with no name', () => {
      expect(savedAddresses(null)).toEqual([]);
      expect(savedAddresses({})).toEqual([]);
      expect(savedAddresses({ home_addresses: 'nope' })).toEqual([]);
      expect(savedAddresses({ home_addresses: [null, { label: '  ' }, { label: 'Work' }] })).toEqual([
        { label: 'Work' },
      ]);
    });
  });

  describe('orphanedCommuteLabels', () => {
    const addresses = [{ label: 'Work' }, { label: 'School' }];

    it('names the limits whose address is gone, and only those', () => {
      expect(orphanedCommuteLabels({ Work: 35, 'Old office': 20 }, addresses)).toEqual(['Old office']);
      expect(orphanedCommuteLabels({ Work: 35, School: 20 }, addresses)).toEqual([]);
    });

    /** Labels are compared exactly, the way the stored travel times are keyed. */
    it('does not match a label that merely looks similar', () => {
      expect(orphanedCommuteLabels({ work: 35 }, addresses)).toEqual(['work']);
      expect(orphanedCommuteLabels({ 'Work ': 35 }, addresses)).toEqual(['Work ']);
    });

    it('finds nothing to complain about when there are no limits', () => {
      expect(orphanedCommuteLabels(null, addresses)).toEqual([]);
      expect(orphanedCommuteLabels({}, addresses)).toEqual([]);
    });

    /**
     * Every limit counts as orphaned while the address list is still loading, and the form's warning
     * would be wrong. It is not shown then either: with no addresses the section renders the "add an
     * address" banner instead and never reaches the clearing rule.
     */
    it('treats every limit as orphaned when there are no addresses at all', () => {
      expect(orphanedCommuteLabels({ Work: 35 }, [])).toEqual(['Work']);
      expect(orphanedCommuteLabels({ Work: 35 }, null)).toEqual(['Work']);
    });
  });
});

describe('the collapsed job section', () => {
  const context = { t: (key, vars) => `${key}:${vars?.count ?? ''}`, formatPrice: (value) => String(value) };

  it('says a commute limit is set, so the section does not have to be opened to find out', () => {
    const parts = describeJobRefinements({ commuteFilter: { action: 'notify', limits: { Work: 35 } } }, context);
    expect(parts).toContain('jobs.mutation.summaryCommute:1');
  });

  it('stays quiet for a job without one', () => {
    expect(describeJobRefinements({ commuteFilter: null }, context)).toEqual([]);
    expect(describeJobRefinements({ commuteFilter: { limits: {} } }, context)).toEqual([]);
  });
});
