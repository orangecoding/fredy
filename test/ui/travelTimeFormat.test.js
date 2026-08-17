/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  addressesWithBudget,
  availableModes,
  commuteBand,
  commuteBandMode,
  commuteBudgetOf,
  hasAnyTime,
  parseCommuteFilter,
  primaryMode,
} from '../../ui/src/components/transit/travelTimeFormat.js';

describe('travelTimeFormat', () => {
  describe('availableModes', () => {
    it('leaves out the modes that were never routable', () => {
      const modes = availableModes({ transit: { minutes: 31, transfers: 1 }, car: { minutes: 12 } });
      expect(modes.map((mode) => mode.key)).toEqual(['transit', 'car']);
      expect(modes[0].transfers).toBe(1);
    });

    it('says nothing at all about an entry with no times', () => {
      expect(availableModes({ label: 'Home' })).toEqual([]);
      expect(hasAnyTime({ label: 'Home' })).toBe(false);
    });
  });

  describe('primaryMode', () => {
    /**
     * The listing as the sweep leaves it, and as the detail page leaves it. Both describe the same
     * flat, so the card has to say the same thing about it either way - which it did not while it
     * showed the fastest mode, because opening the listing is what adds the driving time.
     */
    const estimated = { label: 'Home', mode: 'transit', transit: { minutes: 31, transfers: 1 }, estimate: true };
    const refined = {
      label: 'Home',
      mode: 'transit',
      transit: { minutes: 34, transfers: 1 },
      car: { minutes: 12 },
      bike: { minutes: 26 },
      walk: { minutes: 70 },
      estimate: false,
    };

    it('leads with the mode the address is measured in, not the fastest one', () => {
      expect(primaryMode(refined).key).toBe('transit');
      expect(primaryMode(refined).minutes).toBe(34);
    });

    it('does not change when the exact times arrive', () => {
      expect(primaryMode(estimated).key).toBe(primaryMode(refined).key);
    });

    it('follows an address that is measured by car', () => {
      expect(primaryMode({ ...refined, mode: 'car' }).key).toBe('car');
    });

    it('falls back to public transport for a row written before the mode was recorded', () => {
      expect(primaryMode({ ...refined, mode: null }).key).toBe('transit');
    });

    it('falls back to what there is when the wanted mode has no answer', () => {
      expect(primaryMode({ mode: 'transit', car: { minutes: 12 } }).key).toBe('car');
    });

    it('has nothing to say about an entry with no times', () => {
      expect(primaryMode({ label: 'Home', mode: 'transit' })).toBeNull();
    });
  });

  describe('parseCommuteFilter', () => {
    it('reads mode and ceiling out of one value', () => {
      expect(parseCommuteFilter('transit:30')).toEqual({ mode: 'transit', maxMinutes: 30 });
    });

    it('refuses half a filter', () => {
      expect(parseCommuteFilter('transit')).toBeNull();
      expect(parseCommuteFilter('teleport:30')).toBeNull();
      expect(parseCommuteFilter('transit:0')).toBeNull();
      expect(parseCommuteFilter(null)).toBeNull();
    });
  });

  describe('addressesWithBudget', () => {
    const saved = [
      { label: 'Work', mode: 'transit' },
      { label: 'School', mode: 'transit' },
    ];

    it("joins a job's limits onto the addresses that carry the mode", () => {
      const budgeted = addressesWithBudget(saved, { limits: { Work: 35 } });
      expect(budgeted).toEqual([{ label: 'Work', mode: 'transit', maxMinutes: 35 }]);
    });

    it('drops a limit whose address is gone, and one that is not a limit', () => {
      expect(addressesWithBudget(saved, { limits: { Gym: 20 } })).toEqual([]);
      expect(addressesWithBudget(saved, { limits: { Work: 0 } })).toEqual([]);
    });

    /** Every job before this feature, which is what keeps every pin the colour it has always been. */
    it('has nothing for a job without a filter', () => {
      expect(addressesWithBudget(saved, null)).toEqual([]);
      expect(addressesWithBudget(saved, {})).toEqual([]);
      expect(addressesWithBudget(null, { limits: { Work: 35 } })).toEqual([]);
    });
  });

  describe('commuteBand', () => {
    const work = { label: 'Work', mode: 'transit', maxMinutes: 40 };

    /**
     * @param {number} minutes
     * @param {string} [label]
     * @returns {Object}
     */
    const entry = (minutes, label = 'Work') => ({ label, mode: 'transit', transit: { minutes, transfers: 1 } });

    it('grades a commute against the ceiling on its address', () => {
      expect(commuteBand(entry(30), work)).toBe('good');
      expect(commuteBand(entry(40), work)).toBe('good');
      expect(commuteBand(entry(46), work)).toBe('acceptable');
      expect(commuteBand(entry(50), work)).toBe('acceptable');
      expect(commuteBand(entry(51), work)).toBe('poor');
    });

    it('has no colour to give without a ceiling or without an answer', () => {
      expect(commuteBand(entry(30), { label: 'Work', mode: 'transit' })).toBeNull();
      expect(commuteBand({ label: 'Work', mode: 'transit' }, work)).toBeNull();
      expect(commuteBand(entry(30), undefined)).toBeNull();
    });

    it('grades in the mode the address is measured in', () => {
      const byCar = { label: 'Work', mode: 'car', maxMinutes: 20 };
      const both = { label: 'Work', mode: 'car', car: { minutes: 15 }, transit: { minutes: 80 } };
      expect(commuteBand(both, byCar)).toBe('good');
      expect(commuteBand(both, { ...byCar, mode: 'transit' })).toBe('poor');
    });

    /**
     * What the badge checks before it paints anything. The card leads with the first mode that has
     * an answer, which on a row written before the mode was recorded need not be the mode the
     * ceiling is about - and a colour applied to the wrong number is worse than no colour.
     */
    it('names the mode it is grading, so a caller can tell it apart from the one it shows', () => {
      expect(commuteBandMode({ mode: 'car' }, { mode: 'walk', maxMinutes: 20 })).toBe('walk');
      expect(commuteBandMode({ mode: 'car' }, { maxMinutes: 20 })).toBe('car');
      expect(commuteBandMode({ mode: null }, { maxMinutes: 20 })).toBe('transit');
      expect(commuteBandMode({ mode: 'hovercraft' }, { mode: 'rocket', maxMinutes: 20 })).toBe('transit');
    });

    it('has nothing to say when only some other mode was measured', () => {
      const walkOnly = { label: 'Work', mode: 'walk', walk: { minutes: 8 } };
      expect(commuteBand(walkOnly, { label: 'Work', mode: 'transit', maxMinutes: 20 })).toBeNull();
    });
  });

  describe('commuteBudgetOf', () => {
    it('reads a usable limit and nothing else', () => {
      expect(commuteBudgetOf({ maxMinutes: 35 })).toBe(35);
      expect(commuteBudgetOf({ maxMinutes: '35' })).toBe(35);
      expect(commuteBudgetOf({ maxMinutes: 0 })).toBeNull();
      expect(commuteBudgetOf({})).toBeNull();
      expect(commuteBudgetOf(null)).toBeNull();
    });
  });
});
