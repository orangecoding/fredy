/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

import { timeZoneOptions } from '../../ui/src/services/time/timeService.js';

/**
 * The list behind the working-hours zone picker. A Select renders nothing for a value with no
 * matching option, so a gap here does not look like a bug - it looks like the setting is unset.
 */
describe('timeZoneOptions', () => {
  afterEach(() => vi.restoreAllMocks());

  it("offers the runtime's zones as {value,label} pairs", () => {
    const options = timeZoneOptions(null);

    expect(options.length).toBeGreaterThan(100);
    expect(options).toContainEqual({ value: 'Europe/Berlin', label: 'Europe/Berlin' });
  });

  it('is sorted, so the search list reads predictably', () => {
    const values = timeZoneOptions(null).map((option) => option.value);

    expect(values).toEqual([...values].sort());
  });

  it('spells multi-word zones without underscores', () => {
    expect(timeZoneOptions(null)).toContainEqual({ value: 'America/New_York', label: 'America/New York' });
  });

  it('keeps a stored zone the runtime does not list', () => {
    // Legacy names such as US/Eastern resolve fine but are absent from Intl.supportedValuesOf, and
    // an installation whose TZ has always been that would otherwise show an empty picker.
    const options = timeZoneOptions('US/Eastern');

    expect(options.filter((option) => option.value === 'US/Eastern')).toHaveLength(1);
  });

  it('does not duplicate a stored zone that is already listed', () => {
    const options = timeZoneOptions('Europe/Berlin');

    expect(options.filter((option) => option.value === 'Europe/Berlin')).toHaveLength(1);
  });

  it('still offers something on a browser without Intl.supportedValuesOf', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue([]);

    const options = timeZoneOptions('Asia/Tokyo');

    expect(options.length).toBeGreaterThan(0);
    expect(options.map((option) => option.value)).toContain('Asia/Tokyo');
    expect(options.map((option) => option.value)).toContain('UTC');
  });
});
