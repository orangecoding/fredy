/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { mergeSection, stripSection, HOUSEHOLD_KEYS } from '../../../lib/services/finance/profileSections.js';

const draft = {
  personA: { enabled: true, age: 34, primaryIncome: 3400, secondaryIncome: 0 },
  personB: { enabled: false },
  livingCosts: 1400,
  existingDebt: 0,
  existingDebtRate: 0,
  existingDebtInterest: 0,
  rollFreedBudgetIntoMortgage: false,
  renting: { nebenkostenPct: 25 },
  financing: { equity: 80000, bundesland: 'NW', scenarios: [{ annualRate: 3.8, tilgung: 2 }] },
};

describe('mergeSection', () => {
  it('writes household and the saved section', () => {
    const result = mergeSection(null, 'rent', draft);
    for (const key of HOUSEHOLD_KEYS) {
      expect(result[key]).toEqual(draft[key]);
    }
    expect(result.renting).toEqual(draft.renting);
  });

  it('does not write the other section when nothing is stored for it', () => {
    const result = mergeSection(null, 'rent', draft);
    expect(result.financing).toBeUndefined();
  });

  it('preserves the other section from what is already stored', () => {
    const stored = { financing: { equity: 12345, bundesland: 'BY', scenarios: [] } };
    const result = mergeSection(stored, 'rent', draft);
    // Saving renting must not overwrite a previously saved buying setup...
    expect(result.financing).toEqual(stored.financing);
    // ...and it must not take the draft's buying edits either, since the user did not save them.
    expect(result.financing.equity).toBe(12345);
  });

  it('updates the shared household even when only one section is saved', () => {
    const stored = { livingCosts: 999, renting: { nebenkostenPct: 10 } };
    const result = mergeSection(stored, 'buy', draft);
    expect(result.livingCosts).toBe(1400); // taken from the edited draft
    expect(result.renting).toEqual(stored.renting); // the other section preserved
    expect(result.financing).toEqual(draft.financing);
  });

  it('defaults the saved section to an empty object when the draft lacks it', () => {
    const result = mergeSection(null, 'rent', { livingCosts: 1400 });
    expect(result.renting).toEqual({});
  });

  // The form always sends the whole household, but a partial payload must not silently wipe
  // fields it never mentioned - that would cost the user their income on an unrelated save.
  it('keeps stored household fields the incoming profile does not mention', () => {
    const stored = {
      personA: { primaryIncome: 3000 },
      livingCosts: 1200,
      existingDebtRate: 250,
      renting: { nebenkostenPct: 25 },
    };
    const result = mergeSection(stored, 'rent', { livingCosts: 1400, renting: { nebenkostenPct: 30 } });
    expect(result.livingCosts).toBe(1400); // mentioned, so the edit wins
    expect(result.personA).toEqual({ primaryIncome: 3000 }); // not mentioned, so it survives
    expect(result.existingDebtRate).toBe(250);
    expect(result.renting).toEqual({ nebenkostenPct: 30 });
  });

  // Nothing may resurrect a deleted half. This is the sequence the two tabs actually produce.
  it('survives save rent, save buy, delete rent, save buy again', () => {
    let stored = mergeSection(null, 'rent', draft);
    expect(stored.renting).toEqual(draft.renting);
    expect(stored.financing).toBeUndefined();

    stored = mergeSection(stored, 'buy', draft);
    expect(stored.renting).toEqual(draft.renting);
    expect(stored.financing).toEqual(draft.financing);

    stored = stripSection(stored, 'rent');
    expect(stored.renting).toBeUndefined();

    stored = mergeSection(stored, 'buy', draft);
    // The draft still carries a renting block, but renting was deleted - saving buying must
    // not bring it back.
    expect(stored.renting).toBeUndefined();
    expect(stored.financing).toEqual(draft.financing);
    expect(stored.livingCosts).toBe(draft.livingCosts);
  });
});

describe('stripSection', () => {
  it('removes the renting block, keeping household and buying', () => {
    const stored = { livingCosts: 1400, renting: { nebenkostenPct: 25 }, financing: { equity: 80000 } };
    const result = stripSection(stored, 'rent');
    expect(result.renting).toBeUndefined();
    expect(result.financing).toEqual({ equity: 80000 });
    expect(result.livingCosts).toBe(1400);
  });

  it('removes the financing block, keeping household and renting', () => {
    const stored = { livingCosts: 1400, renting: { nebenkostenPct: 25 }, financing: { equity: 80000 } };
    const result = stripSection(stored, 'buy');
    expect(result.financing).toBeUndefined();
    expect(result.renting).toEqual({ nebenkostenPct: 25 });
  });

  it('is a no-op safe on an absent profile', () => {
    expect(stripSection(null, 'rent')).toEqual({});
    expect(stripSection(undefined, 'buy')).toEqual({});
  });
});
