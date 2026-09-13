/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { wallClockInZone } from '../../lib/utils/publicationDate.js';

/**
 * Italian portals stamp their adverts with a bare wall clock, and casa.it even hangs a `Z` off one.
 * Reading those as UTC dates an advert edited this afternoon up to two hours into the future, which
 * is what this exists to stop.
 */
describe('wall clocks read in the zone they were written in', () => {
  const rome = (year, month, day, hour, minute, second) =>
    wallClockInZone({ year, month, day, hour, minute, second }, 'Europe/Rome');

  it('takes two hours off a summer stamp', () => {
    expect(rome(2026, 9, 13, 19, 42, 15)).toBe(Date.UTC(2026, 8, 13, 17, 42, 15));
  });

  it('takes one hour off a winter stamp', () => {
    expect(rome(2026, 1, 15, 14, 30, 0)).toBe(Date.UTC(2026, 0, 15, 13, 30, 0));
  });

  /** The offset belongs to the instant the stamp names, not to the moment it is read. */
  it('reads either side of the spring change by its own offset', () => {
    expect(rome(2026, 3, 29, 1, 30, 0)).toBe(Date.UTC(2026, 2, 29, 0, 30, 0));
    expect(rome(2026, 3, 29, 3, 30, 0)).toBe(Date.UTC(2026, 2, 29, 1, 30, 0));
  });

  it('defaults the time of day to midnight in the zone', () => {
    expect(wallClockInZone({ year: 2026, month: 7, day: 1 }, 'Europe/Rome')).toBe(Date.UTC(2026, 5, 30, 22, 0, 0));
  });

  it('reads a zone west of Greenwich as well', () => {
    expect(wallClockInZone({ year: 2026, month: 1, day: 15, hour: 9 }, 'America/New_York')).toBe(
      Date.UTC(2026, 0, 15, 14, 0, 0),
    );
  });
});
