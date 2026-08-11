/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  availableModes,
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
});
