/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  contrastingTextColor,
  departureColor,
  distinctLines,
  formatClockTime,
  formatCountdown,
  formatDistance,
  minutesUntil,
  modeLabelKey,
} from '../../ui/src/components/transit/transitFormat.js';

/** Stands in for the i18n `t`, echoing the key and its interpolated values. */
const t = (key, vars = {}) => (Object.keys(vars).length > 0 ? `${key}:${JSON.stringify(vars)}` : key);

const NOW = Date.parse('2026-07-31T15:30:00Z');

describe('transitFormat', () => {
  describe('departureColor', () => {
    it('uses the colour the feed carries', () => {
      expect(departureColor({ mode: 'SUBWAY', color: '#8c6dab' })).toBe('#8c6dab');
    });

    it('falls back to the mode colour', () => {
      expect(departureColor({ mode: 'TRAM' })).toBe('#ef4444');
      expect(departureColor({ mode: 'BUS', color: null })).toBe('#059669');
    });

    it('has a colour for modes it does not know', () => {
      expect(departureColor({ mode: 'FUNICULAR' })).toBe('#64748b');
      expect(departureColor(null)).toBe('#64748b');
    });
  });

  describe('contrastingTextColor', () => {
    it('writes dark on light badges and light on dark ones', () => {
      expect(contrastingTextColor('#ffdd00')).toBe('#111827');
      expect(contrastingTextColor('#2563eb')).toBe('#ffffff');
    });

    it('expands the short hex form', () => {
      expect(contrastingTextColor('#fff')).toBe('#111827');
    });

    it('defaults to white for anything unparseable', () => {
      expect(contrastingTextColor('rebeccapurple')).toBe('#ffffff');
      expect(contrastingTextColor(undefined)).toBe('#ffffff');
    });
  });

  describe('modeLabelKey', () => {
    it('maps a MOTIS mode to its translation key', () => {
      expect(modeLabelKey('REGIONAL_RAIL')).toBe('transit.mode.regional_rail');
      expect(modeLabelKey(undefined)).toBe('transit.mode.unknown');
    });
  });

  describe('minutesUntil', () => {
    it('counts whole minutes and goes negative once departed', () => {
      expect(minutesUntil('2026-07-31T15:34:40Z', NOW)).toBe(4);
      expect(minutesUntil('2026-07-31T15:29:00Z', NOW)).toBe(-1);
    });
  });

  describe('formatCountdown', () => {
    it('says "now" for the next minute', () => {
      expect(formatCountdown('2026-07-31T15:30:30Z', t, NOW)).toBe('transit.departingNow');
    });

    it('counts the minutes up to an hour out', () => {
      expect(formatCountdown('2026-07-31T15:34:00Z', t, NOW)).toBe('transit.inMinutes:{"minutes":4}');
    });

    it('stays silent for departures that already left or are far out', () => {
      expect(formatCountdown('2026-07-31T15:20:00Z', t, NOW)).toBeNull();
      expect(formatCountdown('2026-07-31T17:00:00Z', t, NOW)).toBeNull();
    });
  });

  describe('formatClockTime', () => {
    it('renders the wall clock time of the given locale', () => {
      expect(formatClockTime('2026-07-31T13:38:00Z', 'de-DE')).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('distinctLines', () => {
    it('lists each line once, in departure order, keeping its colour', () => {
      const lines = distinctLines([
        { line: 'U6', mode: 'SUBWAY', color: '#8c6dab' },
        { line: 'U6', mode: 'SUBWAY', color: '#8c6dab' },
        { line: '300', mode: 'BUS', color: null },
        { line: 'U5', mode: 'SUBWAY', color: '#7e5330' },
      ]);

      expect(lines).toEqual([
        { line: 'U6', mode: 'SUBWAY', color: '#8c6dab' },
        { line: '300', mode: 'BUS', color: null },
        { line: 'U5', mode: 'SUBWAY', color: '#7e5330' },
      ]);
    });

    it('keeps a bus and a train that share a number apart', () => {
      const lines = distinctLines([
        { line: '1', mode: 'TRAM', color: null },
        { line: '1', mode: 'BUS', color: null },
      ]);

      expect(lines).toHaveLength(2);
    });

    it('skips entries without a line and copes with nothing at all', () => {
      expect(distinctLines([{ line: '', mode: 'BUS', color: null }])).toEqual([]);
      expect(distinctLines(undefined)).toEqual([]);
    });
  });

  describe('formatDistance', () => {
    it('uses metres below a kilometre and kilometres above', () => {
      expect(formatDistance(12.4)).toBe('12 m');
      expect(formatDistance(999)).toBe('999 m');
      expect(formatDistance(1500)).toBe('1.5 km');
    });

    it('renders nothing for a missing distance', () => {
      expect(formatDistance(undefined)).toBe('');
    });
  });
});
