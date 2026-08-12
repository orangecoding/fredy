/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, duringWorkingHoursOrNotSet, isValidTimeZone, getProcessTimeZone } from '../../lib/utils.js';
import assert from 'assert';
import { expect } from 'vitest';

/**
 * @param {string|null} from
 * @param {string|null} to
 * @param {string} [timeZone] The zone the window is read in. Every case that asserts on a concrete
 *   hour names one, so the expectations hold wherever the suite is run - they used to depend on
 *   the machine's own zone and only agreed with the assertions in Central Europe.
 */
const fakeWorkingHoursConfig = (from, to, timeZone = 'Europe/Berlin') => ({
  workingHours: {
    to,
    from,
    timeZone,
  },
});

/**
 * Epoch ms for a wall-clock time in a given zone, found by search rather than by construction.
 *
 * Node cannot build a Date from a zone-qualified wall clock, and the arithmetic to do it by hand
 * is the very thing these tests exist to check. Scanning the day in minute steps and asking Intl
 * what each instant reads as keeps the fixture honest, including across a DST boundary.
 *
 * @param {string} isoDay YYYY-MM-DD
 * @param {string} wallClock HH:mm as read in `timeZone`
 * @param {string} timeZone
 * @returns {number} Epoch ms
 */
function instantAt(isoDay, wallClock, timeZone) {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const start = Date.parse(`${isoDay}T00:00:00Z`) - 24 * 60 * 60 * 1000;
  for (let offset = 0; offset <= 48 * 60; offset++) {
    const candidate = start + offset * 60 * 1000;
    const parts = Object.fromEntries(format.formatToParts(candidate).map((part) => [part.type, part.value]));
    if (`${parts.year}-${parts.month}-${parts.day}` === isoDay && `${parts.hour}:${parts.minute}` === wallClock) {
      return candidate;
    }
  }
  throw new Error(`${wallClock} does not exist on ${isoDay} in ${timeZone}`);
}

describe('utils', () => {
  describe('#isOneOf()', () => {
    it('should be false', () => {
      assert.equal(isOneOf('bla', ['blub']), false);
    });
    it('should be true', () => {
      assert.equal(isOneOf('bla blub blubber', ['bla']), true);
    });
  });
  describe('#duringWorkingHoursOrNotSet()', () => {
    it('should be false', () => {
      // The epoch, which is 01:00 in Berlin.
      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('12:00', '13:00'), 0)).toBe(false);
    });
    it('should be true', () => {
      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('10:00', '16:00'), 1622026740000)).toBe(true);
    });
    it('should be true if nothing set', () => {
      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig(null, null), 1622026740000)).toBe(true);
    });
    it('should be true if only to is set', () => {
      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig(null, '13:00'), 1622026740000)).toBe(true);
    });
    it('should be true if only from is set', () => {
      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('12:00', null), 1622026740000)).toBe(true);
    });
    it('should handle working hours that cross midnight (e.g., 05:00 → 00:30)', () => {
      const cfg = fakeWorkingHoursConfig('05:00', '00:30');
      const at = (wallClock) => instantAt('2025-06-11', wallClock, 'Europe/Berlin');

      expect(duringWorkingHoursOrNotSet(cfg, at('23:00'))).toBe(true); // 23:00 => within window
      expect(duringWorkingHoursOrNotSet(cfg, at('01:00'))).toBe(false); // 01:00 => outside window
      expect(duringWorkingHoursOrNotSet(cfg, at('06:00'))).toBe(true); // 06:00 => within window
    });

    it('reads the window in the configured zone, not the one the process runs in', () => {
      // The whole point of the setting: one instant, one configuration, two answers depending on
      // where the operator says their hours apply. 1622026740000 is 12:59 in Berlin, 19:59 in Tokyo.
      const window = (timeZone) => fakeWorkingHoursConfig('10:00', '16:00', timeZone);

      expect(duringWorkingHoursOrNotSet(window('Europe/Berlin'), 1622026740000)).toBe(true);
      expect(duringWorkingHoursOrNotSet(window('Asia/Tokyo'), 1622026740000)).toBe(false);
      expect(duringWorkingHoursOrNotSet(window('UTC'), 1622026740000)).toBe(true);
    });

    it('holds its edges across a daylight saving change', () => {
      // Europe/Berlin skips 02:00-03:00 on 2025-03-30. Building the window with Date#setHours used
      // to resolve those edges against a day that has 23 hours, so a window touching the gap moved
      // by an hour on exactly that day.
      const cfg = fakeWorkingHoursConfig('01:00', '04:00');
      const at = (wallClock) => instantAt('2025-03-30', wallClock, 'Europe/Berlin');

      expect(duringWorkingHoursOrNotSet(cfg, at('01:30'))).toBe(true);
      expect(duringWorkingHoursOrNotSet(cfg, at('03:30'))).toBe(true);
      expect(duringWorkingHoursOrNotSet(cfg, at('04:30'))).toBe(false);
    });

    it('falls back to the process zone when no zone is configured', () => {
      // How every installation behaved before the setting existed, and what a configuration that
      // predates migration 34 still gets.
      const processZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const at = (wallClock) => instantAt('2025-06-11', wallClock, processZone);
      const cfg = { workingHours: { from: '09:00', to: '17:00' } };

      expect(duringWorkingHoursOrNotSet(cfg, at('12:00'))).toBe(true);
      expect(duringWorkingHoursOrNotSet(cfg, at('08:00'))).toBe(false);
    });

    it('treats an unusable zone like an unset one rather than stopping every job', () => {
      const processZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const noon = instantAt('2025-06-11', '12:00', processZone);

      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('09:00', '17:00', 'Mars/Olympus'), noon)).toBe(true);
      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('09:00', '17:00', ''), noon)).toBe(true);
    });

    it('allows the run when a time is malformed', () => {
      // Lenient by design: a typo in the settings must not silently stop the scheduler.
      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('nonsense', '17:00'), 1622026740000)).toBe(true);
      expect(duringWorkingHoursOrNotSet(fakeWorkingHoursConfig('09:00', '25:00'), 1622026740000)).toBe(true);
    });

    it('includes both edges of the window', () => {
      const cfg = fakeWorkingHoursConfig('10:00', '16:00');
      const at = (wallClock) => instantAt('2025-06-11', wallClock, 'Europe/Berlin');

      expect(duringWorkingHoursOrNotSet(cfg, at('10:00'))).toBe(true);
      expect(duringWorkingHoursOrNotSet(cfg, at('16:00'))).toBe(true);
      expect(duringWorkingHoursOrNotSet(cfg, at('09:59'))).toBe(false);
      expect(duringWorkingHoursOrNotSet(cfg, at('16:01'))).toBe(false);
    });
  });

  describe('#isValidTimeZone()', () => {
    it('accepts canonical zones', () => {
      expect(isValidTimeZone('Europe/Berlin')).toBe(true);
      expect(isValidTimeZone('UTC')).toBe(true);
    });
    it('accepts legacy names that Intl.supportedValuesOf does not list', () => {
      // The reason the check builds a formatter instead of looking the name up in that list.
      // `TZ=US/Eastern` is a perfectly ordinary thing to find in a docker-compose file.
      for (const zone of ['US/Eastern', 'Etc/GMT+5', 'GMT']) {
        expect(Intl.supportedValuesOf('timeZone').includes(zone)).toBe(false);
        expect(isValidTimeZone(zone)).toBe(true);
      }
    });
    it('rejects anything Intl cannot resolve', () => {
      expect(isValidTimeZone('Mars/Olympus')).toBe(false);
      expect(isValidTimeZone('')).toBe(false);
      expect(isValidTimeZone(null)).toBe(false);
      expect(isValidTimeZone(42)).toBe(false);
    });
  });

  describe('#getProcessTimeZone()', () => {
    it('names a zone that is itself valid', () => {
      // Migration 34 writes this value into stored settings, so an unusable one would be pinned
      // into every upgraded installation.
      expect(isValidTimeZone(getProcessTimeZone())).toBe(true);
    });
  });
});
