/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { isProfileComplete } from '../../../lib/services/finance/affordability.js';
import { defaultProfile, normalizeProfile } from '../../../lib/services/finance/profile.js';

const complete = (overrides = {}) => ({
  personA: { label: 'A', enabled: true, age: 34, primaryIncome: 3400, secondaryIncome: 0 },
  livingCosts: 1400,
  financing: {
    equity: 80000,
    bundesland: 'NW',
    scenarios: [{ id: 'mid', annualRate: 3.8, tilgung: 2, fixedYears: 10 }],
  },
  ...overrides,
});

// This gate decides whether the listings filter, the verdict chips and the detail-page
// financing card appear at all. Getting it wrong either hides the feature from users who
// configured it, or shows empty widgets to users who never did.
describe('isProfileComplete', () => {
  it('accepts a fully configured profile', () => {
    expect(isProfileComplete(complete())).toBe(true);
  });

  it('rejects a missing profile', () => {
    expect(isProfileComplete(null)).toBe(false);
    expect(isProfileComplete(undefined)).toBe(false);
    expect(isProfileComplete('nope')).toBe(false);
    expect(isProfileComplete({})).toBe(false);
  });

  it('rejects a freshly seeded profile the user has not filled in', () => {
    expect(isProfileComplete(defaultProfile())).toBe(false);
    expect(isProfileComplete(normalizeProfile(null))).toBe(false);
  });

  it('requires income from somebody', () => {
    expect(
      isProfileComplete(complete({ personA: { enabled: true, age: 34, primaryIncome: 0, secondaryIncome: 0 } })),
    ).toBe(false);
  });

  it('counts a secondary income, and an enabled partner, as income', () => {
    expect(
      isProfileComplete(complete({ personA: { enabled: true, age: 34, primaryIncome: 0, secondaryIncome: 800 } })),
    ).toBe(true);
    expect(
      isProfileComplete(
        complete({
          personA: { enabled: true, age: 34, primaryIncome: 0, secondaryIncome: 0 },
          personB: { enabled: true, age: 36, primaryIncome: 2400, secondaryIncome: 0 },
        }),
      ),
    ).toBe(true);
  });

  it('ignores the income of a partner who is not enabled', () => {
    expect(
      isProfileComplete(
        complete({
          personA: { enabled: true, age: 34, primaryIncome: 0, secondaryIncome: 0 },
          personB: { enabled: false, age: 36, primaryIncome: 2400, secondaryIncome: 0 },
        }),
      ),
    ).toBe(false);
  });

  it('requires living costs to be answered, but accepts zero', () => {
    expect(isProfileComplete(complete({ livingCosts: undefined }))).toBe(false);
    expect(isProfileComplete(complete({ livingCosts: null }))).toBe(false);
    expect(isProfileComplete(complete({ livingCosts: 0 }))).toBe(true);
  });

  it('requires equity to be answered, but accepts zero', () => {
    expect(isProfileComplete(complete({ financing: { bundesland: 'NW', scenarios: [{ annualRate: 3.8 }] } }))).toBe(
      false,
    );
    expect(
      isProfileComplete(complete({ financing: { equity: 0, bundesland: 'NW', scenarios: [{ annualRate: 3.8 }] } })),
    ).toBe(true);
  });

  it('requires the financing block itself', () => {
    expect(isProfileComplete(complete({ financing: undefined }))).toBe(false);
    expect(isProfileComplete(complete({ financing: 'nope' }))).toBe(false);
  });

  it('requires a known Bundesland, unless an explicit tax rate was given', () => {
    expect(
      isProfileComplete(complete({ financing: { equity: 0, bundesland: 'XX', scenarios: [{ annualRate: 3.8 }] } })),
    ).toBe(false);
    expect(
      isProfileComplete(
        complete({
          financing: { equity: 0, bundesland: 'XX', grunderwerbsteuerPct: 5, scenarios: [{ annualRate: 3.8 }] },
        }),
      ),
    ).toBe(true);
  });

  it('requires at least one usable rate scenario', () => {
    expect(isProfileComplete(complete({ financing: { equity: 0, bundesland: 'NW', scenarios: [] } }))).toBe(false);
    expect(isProfileComplete(complete({ financing: { equity: 0, bundesland: 'NW' } }))).toBe(false);
    expect(
      isProfileComplete(complete({ financing: { equity: 0, bundesland: 'NW', scenarios: [{ annualRate: 0 }] } })),
    ).toBe(false);
  });
});

describe('normalizeProfile', () => {
  it('fills gaps in a profile written by an older version', () => {
    const normalized = normalizeProfile({ personA: { primaryIncome: 3000 }, livingCosts: 1200 });

    expect(normalized.personA.primaryIncome).toBe(3000);
    expect(normalized.personA.age).toBe(defaultProfile().personA.age);
    expect(normalized.personB.enabled).toBe(false);
    expect(normalized.financing.scenarios).toHaveLength(3);
    expect(normalized.financing.bundesland).toBe('NW');
  });

  it('keeps stored scenarios instead of the seeded ones', () => {
    const normalized = normalizeProfile({ financing: { scenarios: [{ id: 'only', annualRate: 2.5 }] } });

    expect(normalized.financing.scenarios).toHaveLength(1);
    expect(normalized.financing.scenarios[0].annualRate).toBe(2.5);
  });

  it('returns the defaults for anything unusable', () => {
    expect(normalizeProfile(null)).toEqual(defaultProfile());
    expect(normalizeProfile('nope')).toEqual(defaultProfile());
  });
});
