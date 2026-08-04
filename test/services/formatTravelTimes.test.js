/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { formatTravelTimes } from '../../lib/utils/formatTravelTimes.js';
import { formatListing } from '../../lib/utils/formatListing.js';

/**
 * The one rule this has to keep: a notification never carries a commute unless a router produced
 * one. Everything else here is wording; this is correctness. Adapters drop the line with the same
 * `filter(Boolean)` they use for a missing price, so `null` is what makes the feature invisible on
 * an instance that has no addresses configured.
 */
describe('formatTravelTimes', () => {
  const entry = (overrides = {}) => ({ label: 'Home', transit: { minutes: 32, transfers: 1 }, ...overrides });

  it('says nothing when there is nothing real to say', () => {
    expect(formatTravelTimes(null)).toBeNull();
    expect(formatTravelTimes([])).toBeNull();
    // A row exists but no mode was routable - still nothing to report.
    expect(formatTravelTimes([{ label: 'Home' }])).toBeNull();
  });

  it('names the address and the modes that were answered for', () => {
    const line = formatTravelTimes([entry({ car: { minutes: 18 }, walk: { minutes: 55 } })]);

    expect(line).toBe('Home: 32 min transit (1 change), 18 min car, 55 min walk');
  });

  it('leaves out a mode that was not routable rather than writing a zero', () => {
    expect(formatTravelTimes([entry()])).toBe('Home: 32 min transit (1 change)');
  });

  it('drops the transfer count when there are none', () => {
    expect(formatTravelTimes([entry({ transit: { minutes: 12, transfers: 0 } })])).toBe('Home: 12 min transit');
  });

  it('lists every address that has an answer, and only those', () => {
    const line = formatTravelTimes([
      entry(),
      { label: 'Work' },
      entry({ label: 'Gym', transit: undefined, car: { minutes: 9 } }),
    ]);

    expect(line).toBe('Home: 32 min transit (1 change) | Gym: 9 min car');
  });

  it('follows the job owner’s language', () => {
    expect(formatTravelTimes([entry({ transit: { minutes: 32, transfers: 2 } })], 'de')).toBe(
      'Home: 32 min ÖPNV (2 Umstiege)',
    );
    // An unknown language falls back to English, never to German.
    expect(formatTravelTimes([entry()], 'xx')).toContain('transit');
  });
});

describe('formatListing', () => {
  it('carries the commute for adapters to drop straight into a line', () => {
    const formatted = formatListing({ price: 900, travelTimes: [{ label: 'Home', car: { minutes: 18 } }] });

    expect(formatted.commute).toBe('Home: 18 min car');
    expect([formatted.price, formatted.commute].filter(Boolean).join(' | ')).toBe('900 € | Home: 18 min car');
  });

  it('leaves it null on a listing nothing has been computed for', () => {
    expect(formatListing({ price: 900 }).commute).toBeNull();
  });
});
