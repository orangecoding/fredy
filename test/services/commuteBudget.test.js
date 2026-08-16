/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COMMUTE_ACTION,
  ESTIMATE_TOLERANCE,
  addressesWithBudget,
  exceedsCommuteBudget,
  normalizeCommuteBudget,
  normalizeCommuteFilter,
} from '../../lib/utils/commuteBudget.js';

/**
 * A stored travel time as the sweep leaves it: public transport only, marked as an estimate.
 *
 * @param {number} minutes
 * @param {Object} [overrides]
 * @returns {Object}
 */
function transitEntry(minutes, overrides = {}) {
  return { label: 'Work', mode: 'transit', estimate: true, transit: { minutes, transfers: 1 }, ...overrides };
}

/** The user's saved addresses. What the job says about them is passed separately, as it is stored. */
const WORK = { label: 'Work', mode: 'transit' };
const SCHOOL = { label: 'School', mode: 'transit' };

/**
 * The two halves joined the way the pipeline joins them.
 *
 * @param {Object} filter - As stored on the job.
 * @param {Array<Object>} [addresses]
 * @returns {Array<Object>}
 */
function budgeted(filter, addresses = [WORK, SCHOOL]) {
  return addressesWithBudget(addresses, normalizeCommuteFilter(filter));
}

describe('commuteBudget', () => {
  describe('normalizeCommuteBudget', () => {
    it('takes a whole number of minutes', () => {
      expect(normalizeCommuteBudget(35)).toBe(35);
      expect(normalizeCommuteBudget('35')).toBe(35);
      expect(normalizeCommuteBudget(35.7)).toBe(35);
    });

    it('reads everything else as no limit at all', () => {
      // Zero and the empty string are what a cleared field sends. Reading either as a limit would
      // hold back every listing, which is the one outcome this must never produce.
      for (const value of [undefined, null, '', 0, -5, 'soon', NaN, Infinity, {}]) {
        expect(normalizeCommuteBudget(value)).toBeNull();
      }
    });
  });

  describe('normalizeCommuteFilter', () => {
    it('keeps the limits that mean something and defaults the action', () => {
      expect(normalizeCommuteFilter({ limits: { Work: 35 } })).toEqual({
        action: DEFAULT_COMMUTE_ACTION,
        limits: { Work: 35 },
      });
    });

    it('drops the entries that are not limits', () => {
      const filter = normalizeCommuteFilter({ action: 'exclude', limits: { Work: 35, Gym: 0, Pool: '', '  ': 20 } });
      expect(filter).toEqual({ action: 'exclude', limits: { Work: 35 } });
    });

    /**
     * A filter that would hold nothing back has to be indistinguishable from not having one, or
     * every caller has to re-derive emptiness and one of them eventually forgets.
     */
    it('is null whenever it would do nothing', () => {
      expect(normalizeCommuteFilter(null)).toBeNull();
      expect(normalizeCommuteFilter({})).toBeNull();
      expect(normalizeCommuteFilter({ action: 'exclude' })).toBeNull();
      expect(normalizeCommuteFilter({ limits: {} })).toBeNull();
      expect(normalizeCommuteFilter({ limits: { Work: 0 } })).toBeNull();
      expect(normalizeCommuteFilter([])).toBeNull();
      expect(normalizeCommuteFilter('35')).toBeNull();
    });

    it('refuses an action it does not know', () => {
      expect(normalizeCommuteFilter({ action: 'delete-everything', limits: { Work: 35 } }).action).toBe(
        DEFAULT_COMMUTE_ACTION,
      );
    });
  });

  describe('addressesWithBudget', () => {
    it("joins the job's limits onto the addresses that carry the mode", () => {
      const addresses = budgeted({ limits: { Work: 35 } });
      expect(addresses.map((address) => address.label)).toEqual(['Work']);
      expect(addresses[0]).toMatchObject({ maxMinutes: 35, mode: 'transit' });
    });

    /**
     * A limit naming an address the user has since deleted has no mode to be judged in, so it is
     * dropped rather than guessed at. Guessing would judge a train commute by the driving time.
     */
    it('drops a limit whose address is gone', () => {
      expect(budgeted({ limits: { Gym: 20 } })).toEqual([]);
    });

    it('has nothing to enforce without a filter', () => {
      expect(addressesWithBudget([WORK], null)).toEqual([]);
      expect(addressesWithBudget(null, normalizeCommuteFilter({ limits: { Work: 35 } }))).toEqual([]);
    });
  });

  describe('exceedsCommuteBudget', () => {
    const within30 = budgeted({ limits: { Work: 30 } });

    it('does nothing at all when the job has no limits', () => {
      expect(exceedsCommuteBudget([transitEntry(180)], budgeted(null))).toBe(false);
      expect(exceedsCommuteBudget([transitEntry(180)], [])).toBe(false);
    });

    it('keeps a listing inside the limit', () => {
      expect(exceedsCommuteBudget([transitEntry(22)], within30)).toBe(false);
    });

    it('holds back a listing well past the limit', () => {
      expect(exceedsCommuteBudget([transitEntry(65)], within30)).toBe(true);
    });

    /**
     * The point of the tolerance. The sweep walks the last stretch from the straight-line distance,
     * so a 30 minute limit met by an estimate of 33 is very likely met in reality too, and there is
     * no way back from a notification that was never sent.
     */
    it('gives an estimate slack before holding it back', () => {
      expect(exceedsCommuteBudget([transitEntry(33)], within30)).toBe(false);
      expect(exceedsCommuteBudget([transitEntry(Math.ceil(30 * ESTIMATE_TOLERANCE) + 1)], within30)).toBe(true);
    });

    it('gives an exactly routed time no slack', () => {
      expect(exceedsCommuteBudget([transitEntry(33, { estimate: false })], within30)).toBe(true);
      expect(exceedsCommuteBudget([transitEntry(30, { estimate: false })], within30)).toBe(false);
    });

    it('never holds back a listing it knows nothing about', () => {
      // Not swept yet, no answer for this address, no connection in the mode that was asked for.
      expect(exceedsCommuteBudget(null, within30)).toBe(false);
      expect(exceedsCommuteBudget([], within30)).toBe(false);
      expect(exceedsCommuteBudget([transitEntry(65, { label: 'Home' })], within30)).toBe(false);
      expect(exceedsCommuteBudget([{ label: 'Work', mode: 'transit', estimate: true }], within30)).toBe(false);
    });

    it('judges an address in the mode it is measured in', () => {
      const byCar = budgeted({ limits: { Work: 30 } }, [{ label: 'Work', mode: 'car' }]);
      const byTransit = budgeted({ limits: { Work: 30 } }, [WORK]);
      const entry = { label: 'Work', mode: 'car', estimate: false, car: { minutes: 20 }, transit: { minutes: 70 } };
      expect(exceedsCommuteBudget([entry], byCar)).toBe(false);
      // The same listing, judged as the public transport commute it is not: the mode is the question
      // the user asked, so switching it has to switch the answer.
      expect(exceedsCommuteBudget([entry], byTransit)).toBe(true);
    });

    it('falls back to the mode the row was written with', () => {
      // Addresses saved before the mode was recorded. The row still knows what it measured.
      const entry = { label: 'Work', mode: 'car', estimate: false, car: { minutes: 55 } };
      expect(exceedsCommuteBudget([entry], budgeted({ limits: { Work: 30 } }, [{ label: 'Work' }]))).toBe(true);
    });

    it('treats every limit as a requirement of its own', () => {
      const addresses = budgeted({ limits: { Work: 30, School: 20 } });
      const nearWork = transitEntry(15);
      expect(exceedsCommuteBudget([nearWork, transitEntry(90, { label: 'School' })], addresses)).toBe(true);
      expect(exceedsCommuteBudget([nearWork, transitEntry(12, { label: 'School' })], addresses)).toBe(false);
    });
  });
});
