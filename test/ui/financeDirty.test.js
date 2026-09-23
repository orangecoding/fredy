/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { discardSection, financeDirtyState, isSectionDirty } from '../../ui/src/services/finance/financeDirty.js';

/** A profile shaped like the one the server normalizes and hands back. */
const stored = Object.freeze({
  personA: { age: 35, primaryIncome: 3400, secondaryIncome: 0 },
  personB: { enabled: false },
  livingCosts: 1200,
  existingDebt: 0,
  existingDebtRate: 0,
  financing: { purchasePrice: 340000, equity: 60000, bundesland: 'NW', scenarios: [{ annualRate: 3.8, tilgung: 2 }] },
  renting: { nebenkostenPct: 15 },
});

describe('financeDirtyState', () => {
  it('reports nothing to save for an untouched draft', () => {
    expect(financeDirtyState(stored, stored)).toEqual({ household: false, rent: false, buy: false });
  });

  it('separates the household from the two tabs', () => {
    const edited = { ...stored, livingCosts: 1300 };
    expect(financeDirtyState(edited, stored)).toEqual({ household: true, rent: false, buy: false });
  });

  it('keeps one tab out of the other tab', () => {
    const edited = { ...stored, renting: { nebenkostenPct: 18 } };
    expect(financeDirtyState(edited, stored)).toEqual({ household: false, rent: true, buy: false });
  });

  it('sees an edit inside the financing block', () => {
    const edited = { ...stored, financing: { ...stored.financing, equity: 80000 } };
    expect(financeDirtyState(edited, stored).buy).toBe(true);
  });

  // The order of the scenarios is the order the user put them in, and the first one is what every
  // headline figure is computed from, so swapping two is a change.
  it('treats reordered scenarios as a change', () => {
    const edited = {
      ...stored,
      financing: { ...stored.financing, scenarios: [{ annualRate: 4.6 }, { annualRate: 3.8, tilgung: 2 }] },
    };
    expect(financeDirtyState(edited, stored).buy).toBe(true);
  });

  // `EMPTY_DRAFT` carries `renting: {}` before the first answer lands; a household that never saved
  // the tab has the same thing stored. Neither is an edit.
  it.each([
    [{}, undefined],
    [undefined, {}],
    [{}, null],
  ])('reads %o and %o as the same empty block', (a, b) => {
    expect(financeDirtyState({ renting: a }, { renting: b }).rent).toBe(false);
  });

  it('is not confused by the key order two objects were built in', () => {
    const reordered = { ...stored, personA: { secondaryIncome: 0, primaryIncome: 3400, age: 35 } };
    expect(financeDirtyState(reordered, stored).household).toBe(false);
  });

  it('survives being handed nothing', () => {
    expect(() => financeDirtyState(null, undefined)).not.toThrow();
    expect(financeDirtyState(null, null)).toEqual({ household: false, rent: false, buy: false });
  });
});

describe('isSectionDirty', () => {
  // The household is written along with whichever tab is saved, so an edit to it is something
  // either Save button would commit.
  it('counts a household edit towards both tabs', () => {
    const state = { household: true, rent: false, buy: false };
    expect(isSectionDirty(state, 'rent')).toBe(true);
    expect(isSectionDirty(state, 'buy')).toBe(true);
  });

  it('keeps a tab-only edit out of the other tab', () => {
    const state = { household: false, rent: false, buy: true };
    expect(isSectionDirty(state, 'buy')).toBe(true);
    expect(isSectionDirty(state, 'rent')).toBe(false);
  });
});

describe('rate scenario labels', () => {
  // The label is printed from the rate ("3 %") while the defaults spell it "3.0 %". Typing a rate
  // and then the original one back must not leave the tab dirty over that spelling.
  it('does not count a re-spelt label as a change', () => {
    const baseline = {
      ...stored,
      financing: { ...stored.financing, scenarios: [{ label: '3.0 %', annualRate: 3, tilgung: 2 }] },
    };
    const retyped = {
      ...stored,
      financing: { ...stored.financing, scenarios: [{ label: '3 %', annualRate: 3, tilgung: 2 }] },
    };
    expect(financeDirtyState(retyped, baseline).buy).toBe(false);
  });

  it('still counts a changed rate', () => {
    const changed = {
      ...stored,
      financing: { ...stored.financing, scenarios: [{ label: '3.9 %', annualRate: 3.9, tilgung: 2 }] },
    };
    expect(financeDirtyState(changed, stored).buy).toBe(true);
  });
});

describe('discardSection', () => {
  it('takes back the household and the tab on screen, and leaves the other tab alone', () => {
    const edited = {
      ...stored,
      livingCosts: 1500,
      renting: { nebenkostenPct: 30 },
      financing: { ...stored.financing, equity: 90000 },
    };

    const next = discardSection(edited, stored, 'rent');

    expect(next.livingCosts).toBe(stored.livingCosts);
    expect(next.renting).toEqual(stored.renting);
    // The purchase tab's edit was not on screen and is not what this bar saves.
    expect(next.financing.equity).toBe(90000);
    expect(financeDirtyState(next, stored)).toEqual({ household: false, rent: false, buy: true });
  });

  it('does not change the draft it was handed', () => {
    const edited = { ...stored, livingCosts: 1500 };
    discardSection(edited, stored, 'buy');
    expect(edited.livingCosts).toBe(1500);
  });
});
