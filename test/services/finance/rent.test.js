/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  isRentProfileComplete,
  isProfileComplete,
  rentIncludesCharges,
  rentThresholds,
  verdictForRent,
  verdictForListing,
  scoreRentListing,
  thresholdsFor,
  warmRent,
} from '../../../lib/services/finance/affordability.js';

// A household that has entered the shared fields but nothing purchase-specific: enough to judge
// rentals, not enough to judge purchases. 4000 net, 1400 living costs -> 2600 disposable, and a
// 35 % ceiling of 1400 warm.
const rentHousehold = (overrides = {}) => ({
  personA: { label: 'A', enabled: true, age: 34, primaryIncome: 4000, secondaryIncome: 0 },
  livingCosts: 1400,
  renting: { nebenkostenPct: 25 },
  ...overrides,
});

describe('isRentProfileComplete', () => {
  it('accepts a household with income and living costs, no purchase fields needed', () => {
    expect(isRentProfileComplete(rentHousehold())).toBe(true);
  });

  it('is independent of the purchase side: rent complete, buy not', () => {
    const profile = rentHousehold();
    expect(isRentProfileComplete(profile)).toBe(true);
    expect(isProfileComplete(profile)).toBe(false);
  });

  it('requires an income', () => {
    expect(
      isRentProfileComplete(
        rentHousehold({ personA: { enabled: true, age: 34, primaryIncome: 0, secondaryIncome: 0 } }),
      ),
    ).toBe(false);
  });

  it('requires living costs to be entered deliberately, not merely defaulted', () => {
    expect(isRentProfileComplete(rentHousehold({ livingCosts: null }))).toBe(false);
    // Zero is a real answer.
    expect(isRentProfileComplete(rentHousehold({ livingCosts: 0 }))).toBe(true);
  });

  it('rejects a missing profile', () => {
    expect(isRentProfileComplete(null)).toBe(false);
    expect(isRentProfileComplete({})).toBe(false);
  });

  it('requires the renting block to be present, so a deleted renting tab deactivates', () => {
    // Household is filled, but the renting block was never saved (or was deleted). The rule that
    // income alone must not switch rent verdicts on - that is the whole point of the delete button.
    const withoutRenting = rentHousehold();
    delete withoutRenting.renting;
    expect(isRentProfileComplete(withoutRenting)).toBe(false);
  });
});

describe('warmRent', () => {
  it('adds the Nebenkosten surcharge onto the cold rent', () => {
    expect(warmRent(1000, rentHousehold({ renting: { nebenkostenPct: 25 } }))).toBe(1250);
  });

  it('defaults the surcharge when the renting block is absent', () => {
    // DEFAULT_NEBENKOSTEN_PCT is 25.
    expect(warmRent(1000, {})).toBe(1250);
  });

  // Number(null) and Number('') are both 0 and both finite, so coercing before checking would
  // read a field the user left blank as a deliberate 0 % and judge rentals on cold rent alone.
  it('treats a blank surcharge as not given, not as zero', () => {
    expect(warmRent(1000, { renting: { nebenkostenPct: null } })).toBe(1250);
    expect(warmRent(1000, { renting: { nebenkostenPct: undefined } })).toBe(1250);
    expect(warmRent(1000, { renting: { nebenkostenPct: '' } })).toBe(1250);
  });

  it('still honours an explicit zero', () => {
    expect(warmRent(1000, { renting: { nebenkostenPct: 0 } })).toBe(1000);
  });
});

describe('rentThresholds', () => {
  it('returns null for an incomplete profile', () => {
    expect(rentThresholds({})).toBeNull();
  });

  it('caps warm rent at 35 % of net income and converts back to cold', () => {
    const thresholds = rentThresholds(rentHousehold());
    // 35 % of 4000 = 1400 warm, and disposable (2600) is not the binding constraint here.
    expect(thresholds.warmAffordable).toBeCloseTo(1400, 5);
    // cold = warm / 1.25
    expect(thresholds.affordableMaxRent).toBeCloseTo(1120, 5);
    // 40 % stretch = 1600 warm -> 1280 cold.
    expect(thresholds.warmStretch).toBeCloseTo(1600, 5);
    expect(thresholds.stretchMaxRent).toBeCloseTo(1280, 5);
    expect(thresholds.nebenkostenPct).toBe(25);
  });

  it('is bounded by disposable income when living costs are high', () => {
    // 4000 income, 3000 living costs -> only 1000 disposable, below the 1400 rule ceiling.
    const thresholds = rentThresholds(rentHousehold({ livingCosts: 3000 }));
    expect(thresholds.warmAffordable).toBeCloseTo(1000, 5);
  });
});

describe('verdictForRent', () => {
  const thresholds = rentThresholds(rentHousehold()); // affordable <=1120 cold, stretch <=1280 cold

  it('classifies a cold rent by band', () => {
    expect(verdictForRent(900, thresholds)).toBe('affordable');
    expect(verdictForRent(1120, thresholds)).toBe('affordable');
    expect(verdictForRent(1200, thresholds)).toBe('stretch');
    expect(verdictForRent(1400, thresholds)).toBe('unaffordable');
  });

  it('returns null when there is nothing to judge', () => {
    expect(verdictForRent(900, null)).toBeNull();
    expect(verdictForRent(0, thresholds)).toBeNull();
    expect(verdictForRent('n/a', thresholds)).toBeNull();
  });
});

describe('scoreRentListing', () => {
  it('scores a rental on its warm rent against the budget', () => {
    const scored = scoreRentListing({ id: 'l1', price: 1000, title: 'Flat' }, rentHousehold());
    expect(scored.dealType).toBe('rent');
    expect(scored.coldRent).toBe(1000);
    expect(scored.warmRent).toBeCloseTo(1250, 5);
    expect(scored.nebenkosten).toBeCloseTo(250, 5);
    expect(scored.monthlyPayment).toBeCloseTo(1250, 5); // warm rent is what leaves the account
    expect(scored.remainingAfterRent).toBeCloseTo(1350, 5); // 2600 disposable - 1250 warm
    expect(scored.rateShareOfNetIncome).toBeCloseTo(1250 / 4000, 5);
    expect(scored.verdict).toBe('affordable'); // 1250 warm is under the 1400 ceiling
  });

  it('returns null for a listing without a usable price', () => {
    expect(scoreRentListing({ id: 'l1', price: null }, rentHousehold())).toBeNull();
    expect(scoreRentListing({ id: 'l1', price: 0 }, rentHousehold())).toBeNull();
  });
});

describe('thresholdsFor and verdictForListing', () => {
  it('yields a rent side but no buy side for a rent-only profile', () => {
    const thresholds = thresholdsFor(rentHousehold());
    expect(thresholds.rent).not.toBeNull();
    expect(thresholds.buy).toBeNull();
  });

  it('routes a listing to the yardstick for its deal type', () => {
    const thresholds = thresholdsFor(rentHousehold());
    // A rent listing is judged; a buy listing has no yardstick and yields null.
    expect(verdictForListing(1000, 'rent', thresholds)).toBe('affordable');
    expect(verdictForListing(300000, 'buy', thresholds)).toBeNull();
  });

  it('returns null when thresholds are absent entirely', () => {
    expect(verdictForListing(1000, 'rent', null)).toBeNull();
  });

  // thresholdsFor dereferences profile.financing, so a missing profile must not throw: it is
  // called on every render of the listings overview, including before settings have loaded.
  it('yields two empty sides for a missing or unusable profile', () => {
    for (const profile of [null, undefined, {}, 'nonsense']) {
      const thresholds = thresholdsFor(profile);
      expect(thresholds.buy).toBeNull();
      expect(thresholds.rent).toBeNull();
    }
  });
});

/*
 * A rent quoted with the running charges in it - a French rent "charges comprises", an immowelt
 * Warmmiete - is already what leaves the account every month. Adding the Nebenkosten surcharge on
 * top of it counts the charges twice, so every path that judges a rent has to read how it was quoted.
 */
describe('rentIncludesCharges', () => {
  it('reads the stored flag off a listing row', () => {
    expect(rentIncludesCharges({ charges_included: 1 })).toBe(true);
    expect(rentIncludesCharges({ charges_included: 0 })).toBe(false);
  });

  // NULL is "the portal did not say", which is every German portal and every row stored before the
  // column existed - and those quote the rent cold.
  it('reads a rent nobody described as quoted without the charges', () => {
    expect(rentIncludesCharges({ charges_included: null })).toBe(false);
    expect(rentIncludesCharges({})).toBe(false);
    expect(rentIncludesCharges(null)).toBe(false);
  });
});

describe('verdictForRent on a rent quoted with the charges', () => {
  // The rent household: 1400 warm is the affordable ceiling (1120 cold), 1600 warm the stretch one (1280 cold).
  const thresholds = rentThresholds(rentHousehold());

  it('holds it against the warm ceilings, since there are no Nebenkosten left to add', () => {
    // 1300 with the charges in it is 1300 warm, inside the 1400 ceiling. Read as a cold rent it
    // came to 1625 warm and out of reach.
    expect(verdictForRent(1300, thresholds, { chargesIncluded: true })).toBe('affordable');
    expect(verdictForRent(thresholds.warmAffordable, thresholds, { chargesIncluded: true })).toBe('affordable');
    expect(verdictForRent(1500, thresholds, { chargesIncluded: true })).toBe('stretch');
    expect(verdictForRent(thresholds.warmStretch, thresholds, { chargesIncluded: true })).toBe('stretch');
    expect(verdictForRent(1700, thresholds, { chargesIncluded: true })).toBe('unaffordable');
  });

  it('keeps judging a rent without the charges against the cold ceilings', () => {
    expect(verdictForRent(1300, thresholds)).toBe('unaffordable');
    expect(verdictForRent(1300, thresholds, { chargesIncluded: false })).toBe('unaffordable');
  });

  it('still refuses to judge a rent that is not there', () => {
    expect(verdictForRent(0, thresholds, { chargesIncluded: true })).toBeNull();
    expect(verdictForRent(1300, null, { chargesIncluded: true })).toBeNull();
  });
});

describe('verdictForListing and the rent basis', () => {
  it('passes the basis on to the rent yardstick', () => {
    const thresholds = thresholdsFor(rentHousehold());
    expect(verdictForListing(1300, 'rent', thresholds, { chargesIncluded: true })).toBe('affordable');
    expect(verdictForListing(1300, 'rent', thresholds)).toBe('unaffordable');
  });
});

describe('scoreRentListing on a rent quoted with the charges', () => {
  it('takes the quoted rent as the warm rent and adds nothing on top', () => {
    const scored = scoreRentListing({ id: 'cc', price: 1300, charges_included: 1 }, rentHousehold());
    expect(scored.chargesIncluded).toBe(true);
    expect(scored.price).toBe(1300);
    expect(scored.warmRent).toBe(1300);
    expect(scored.monthlyPayment).toBe(1300);
    expect(scored.remainingAfterRent).toBe(1300); // 2600 disposable - 1300 warm
    expect(scored.rateShareOfNetIncome).toBeCloseTo(1300 / 4000, 5);
    expect(scored.verdict).toBe('affordable');
    // No surcharge went into it, so none is reported.
    expect(scored.nebenkostenPct).toBeNull();
  });

  it('leaves the split unknown where the advert states no charges', () => {
    const scored = scoreRentListing({ id: 'cc', price: 1300, charges_included: 1, charges: null }, rentHousehold());
    expect(scored.coldRent).toBeNull();
    expect(scored.nebenkosten).toBeNull();
  });

  it('reports the stated charges as the Nebenkosten, and the rest as the cold rent', () => {
    const scored = scoreRentListing({ id: 'cc', price: 1300, charges_included: 1, charges: 100 }, rentHousehold());
    expect(scored.nebenkosten).toBe(100);
    expect(scored.coldRent).toBe(1200);
    expect(scored.warmRent).toBe(1300);
  });

  it('ignores a charges figure that would leave no rent at all', () => {
    const scored = scoreRentListing({ id: 'cc', price: 1300, charges_included: 1, charges: 1300 }, rentHousehold());
    expect(scored.nebenkosten).toBeNull();
    expect(scored.coldRent).toBeNull();
    expect(scored.warmRent).toBe(1300);
  });

  // Unchanged on purpose: the listings filter and the chips hold those rows against the cold
  // ceilings, which assume the surcharge, and the detail card has to agree with them.
  it('keeps a rent without the charges on the surcharge, even where the advert states them', () => {
    for (const chargesIncluded of [0, null]) {
      const scored = scoreRentListing(
        { id: 'hc', price: 1000, charges_included: chargesIncluded, charges: 50 },
        rentHousehold(),
      );
      expect(scored.chargesIncluded).toBe(false);
      expect(scored.coldRent).toBe(1000);
      expect(scored.warmRent).toBeCloseTo(1250, 5);
      expect(scored.nebenkosten).toBeCloseTo(250, 5);
      expect(scored.nebenkostenPct).toBe(25);
    }
  });

  it('agrees with the verdict chip on either basis, at every price', () => {
    const profile = rentHousehold();
    const thresholds = rentThresholds(profile);
    for (const price of [500, 1120, 1120.5, 1280, 1300, 1399.99, 1400, 1400.01, 1600, 1600.01, 3000]) {
      for (const chargesIncluded of [1, 0, null]) {
        const scored = scoreRentListing({ id: 'x', price, charges_included: chargesIncluded }, profile);
        expect(scored.verdict, `${price} with charges_included=${chargesIncluded}`).toBe(
          verdictForRent(price, thresholds, { chargesIncluded: chargesIncluded === 1 }),
        );
      }
    }
  });
});
