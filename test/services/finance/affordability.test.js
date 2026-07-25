/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  classify,
  computeBudget,
  debtFreeAges,
  existingDebtSchedule,
  maxAffordablePrice,
  netIncomeOf,
  recommendRate,
  scoreListing,
  verdictForPrice,
} from '../../../lib/services/finance/affordability.js';
import { calculateFinancing } from '../../../lib/services/finance/financing.js';

const profile = (overrides = {}) => ({
  personA: { label: 'A', enabled: true, age: 34, primaryIncome: 3200, secondaryIncome: 200 },
  personB: { label: 'B', enabled: true, age: 36, primaryIncome: 2400, secondaryIncome: 0 },
  livingCosts: 1400,
  existingDebt: 8000,
  existingDebtRate: 250,
  existingDebtInterest: 6.9,
  financing: {
    equity: 80000,
    bundesland: 'NW',
    notaryPct: 1.5,
    maklerPct: 3.57,
    purchasePriceThreshold: 30000,
    scenarios: [{ id: 'mid', annualRate: 3.8, tilgung: 2, fixedYears: 10 }],
  },
  ...overrides,
});

describe('netIncomeOf', () => {
  it('sums both incomes of both partners', () => {
    expect(netIncomeOf(profile())).toBe(5800);
  });

  it('ignores a partner who is not enabled', () => {
    const single = profile({ personB: { enabled: false, age: 36, primaryIncome: 2400, secondaryIncome: 0 } });
    expect(netIncomeOf(single)).toBe(3400);
  });

  it('is zero for an empty profile', () => {
    expect(netIncomeOf({})).toBe(0);
  });
});

describe('computeBudget', () => {
  it('derives the rule cap and what is actually left over', () => {
    const budget = computeBudget(profile());

    expect(budget.netIncome).toBe(5800);
    expect(budget.ruleCap).toBeCloseTo(2030, 6); // 35 %
    expect(budget.headroom).toBeCloseTo(1780, 6); // minus the 250 EUR consumer loan
    expect(budget.disposable).toBe(4150); // 5800 - 1400 - 250
  });

  it('lets existing debt eat into the headroom', () => {
    const withDebt = computeBudget(profile({ existingDebtRate: 800 }));
    const withoutDebt = computeBudget(profile({ existingDebtRate: 0 }));

    expect(withoutDebt.headroom - withDebt.headroom).toBeCloseTo(800, 6);
  });
});

describe('classify', () => {
  const budget = computeBudget(profile({ existingDebtRate: 0, livingCosts: 500 }));

  it('accepts a rate at or below 35 % of net income', () => {
    expect(classify(budget.netIncome * 0.349, budget)).toBe('affordable');
    expect(classify(budget.netIncome * 0.35, budget)).toBe('affordable');
  });

  it('calls the band between 35 % and 40 % a stretch', () => {
    expect(classify(budget.netIncome * 0.37, budget)).toBe('stretch');
    expect(classify(budget.netIncome * 0.4, budget)).toBe('stretch');
  });

  it('rejects anything above 40 %', () => {
    expect(classify(budget.netIncome * 0.45, budget)).toBe('unaffordable');
  });

  it('counts existing debt towards the 35 % ceiling', () => {
    const indebted = computeBudget(profile({ existingDebtRate: 1000, livingCosts: 500 }));
    // 1100 EUR on its own is well under 35 % of 5800, but the 1000 EUR consumer loan shares
    // the same ceiling, so together they push past it.
    expect(classify(1100, budget)).toBe('affordable');
    expect(classify(1100, indebted)).toBe('stretch');
    // The boundary itself still counts as affordable.
    expect(classify(1030, indebted)).toBe('affordable');
  });

  it('rejects a rate the household cannot physically pay, whatever the rule says', () => {
    // Living costs swallow the income, so even a modest rate does not fit.
    const broke = computeBudget(profile({ livingCosts: 5000, existingDebtRate: 0 }));
    expect(broke.netIncome * 0.3).toBeLessThan(broke.ruleCap);
    expect(classify(budget.netIncome * 0.3, broke)).toBe('unaffordable');
  });

  it('rejects everything when there is no income', () => {
    expect(classify(500, computeBudget({}))).toBe('unaffordable');
  });
});

describe('recommendRate', () => {
  it('stays inside the 35 % rule when cash allows', () => {
    const budget = computeBudget(profile());
    const { recommendedRate, limitedBy } = recommendRate(budget, { annualRate: 3.8, loanAmount: 366280 });

    expect(recommendedRate).toBeCloseTo(budget.headroom, 6);
    expect(limitedBy).toBe('rule');
  });

  it('is capped by available cash when living costs are high', () => {
    const budget = computeBudget(profile({ livingCosts: 4200 }));
    const { recommendedRate, limitedBy } = recommendRate(budget, { safetyBuffer: 200 });

    expect(limitedBy).toBe('disposable');
    expect(recommendedRate).toBeCloseTo(budget.disposable - 200, 6);
  });

  it('never recommends a negative rate', () => {
    const budget = computeBudget(profile({ livingCosts: 9000 }));
    expect(recommendRate(budget).recommendedRate).toBe(0);
  });

  it('reports the Tilgung the recommended rate buys', () => {
    const budget = computeBudget(profile());
    const { recommendedRate, impliedTilgung } = recommendRate(budget, { annualRate: 3.8, loanAmount: 366280 });

    // payment = loan * (rate + tilgung) / 12. The Tilgung is rounded to the two decimals a
    // user actually sees, so reproducing the rate from it lands within a euro, not exactly.
    const rebuilt = (366280 * (0.038 + impliedTilgung / 100)) / 12;
    expect(Math.abs(rebuilt - recommendedRate)).toBeLessThan(1);
  });
});

describe('maxAffordablePrice', () => {
  it('round-trips: financing the max price produces a rate at the cap', () => {
    const p = profile();
    const budget = computeBudget(p);
    const price = maxAffordablePrice(budget, p.financing);

    const { primary } = calculateFinancing({ ...p.financing, purchasePrice: price });
    const cap = Math.min(budget.headroom, budget.disposable);
    expect(primary.monthlyPayment).toBeCloseTo(cap, 4);
    expect(classify(primary.monthlyPayment, budget)).toBe('affordable');
  });

  it('grows with equity, but by less than the equity added', () => {
    const p = profile();
    const budget = computeBudget(p);
    const low = maxAffordablePrice(budget, { ...p.financing, equity: 20000 });
    const high = maxAffordablePrice(budget, { ...p.financing, equity: 200000 });

    // 180.000 EUR more equity does not buy 180.000 EUR more house: the Kaufnebenkosten scale
    // with the price, so the extra buys 180.000 / 1,1157 of purchase price in NRW.
    expect(high - low).toBeCloseTo(180000 / 1.1157, 2);
  });

  it('is zero when nothing is left over', () => {
    const budget = computeBudget(profile({ livingCosts: 9000 }));
    expect(maxAffordablePrice(budget, profile().financing)).toBe(0);
  });
});

describe('existingDebtSchedule', () => {
  it('amortizes consumer debt on its own terms', () => {
    const schedule = existingDebtSchedule(profile());

    expect(schedule.payoffMonths).toBeGreaterThan(0);
    expect(schedule.payoffMonths).toBeLessThan(48);
    expect(schedule.months.reduce((sum, m) => sum + m.principal, 0)).toBeCloseTo(8000, 2);
  });

  it('returns nothing when there is no debt', () => {
    expect(existingDebtSchedule(profile({ existingDebt: 0 }))).toBeNull();
    expect(existingDebtSchedule(profile({ existingDebtRate: 0 }))).toBeNull();
  });
});

describe('debtFreeAges', () => {
  it('reports the milestone age for each partner', () => {
    const ages = debtFreeAges(profile(), 348);

    expect(ages).toHaveLength(2);
    expect(ages[0]).toMatchObject({ age: 34, ageWhenDebtFree: 63 });
    expect(ages[1]).toMatchObject({ age: 36, ageWhenDebtFree: 65 });
  });

  it('has no answer when the loan never pays off', () => {
    const ages = debtFreeAges(profile(), null);
    expect(ages[0].ageWhenDebtFree).toBeNull();
    expect(ages[0].payoffDate).toBeNull();
  });

  it('skips a partner who is not enabled', () => {
    const single = profile({ personB: { enabled: false, age: 36, primaryIncome: 0, secondaryIncome: 0 } });
    expect(debtFreeAges(single, 120)).toHaveLength(1);
  });
});

describe('scoreListing', () => {
  it('scores a listing end to end', () => {
    const result = scoreListing({ id: 'l1', price: 350000, title: 'Haus' }, profile());

    expect(result.id).toBe('l1');
    expect(result.price).toBe(350000);
    expect(result.monthlyPayment).toBeGreaterThan(0);
    expect(result.payoffYears).toBeGreaterThan(0);
    expect(result.verdict).toBe('affordable');
    expect(result.rateShareOfNetIncome).toBeLessThanOrEqual(0.35);
  });

  it('marks an expensive listing as out of reach', () => {
    const result = scoreListing({ id: 'l2', price: 900000 }, profile());
    expect(result.verdict).toBe('unaffordable');
  });

  it('reports a term that actually varies with the price', () => {
    // The scenario Tilgung gives every listing the same term - an annuity's duration depends on
    // the rate and Tilgung, not on how much is borrowed - so the per-listing answer has to come
    // from holding the payment at what the household can afford.
    const p = profile();
    const cheap = scoreListing({ price: 280000 }, p);
    const dear = scoreListing({ price: 430000 }, p);

    expect(cheap.payoffYears).toBe(dear.payoffYears);
    expect(cheap.payoffYearsAtBudget).toBeLessThan(dear.payoffYearsAtBudget);
    expect(cheap.payoffYearsAtBudget).toBeGreaterThan(0);
  });

  it('has no term at all when the affordable rate cannot cover the interest', () => {
    const result = scoreListing({ price: 900000 }, profile());

    expect(result.payoffYearsAtBudget).toBeNull();
    expect(result.payoffMonthsAtBudget).toBeNull();
  });

  it('reports the affordable rate it used', () => {
    const p = profile();
    const budget = computeBudget(p);
    const result = scoreListing({ price: 350000 }, p);

    expect(result.affordableRate).toBeCloseTo(Math.min(budget.headroom, budget.disposable), 6);
  });

  it('needs no time at all when equity covers the whole purchase', () => {
    const p = profile({ financing: { ...profile().financing, equity: 900000 } });
    const result = scoreListing({ price: 300000 }, p);

    expect(result.loanAmount).toBe(0);
    expect(result.payoffYearsAtBudget).toBe(0);
  });

  it('returns nothing for a listing without a usable price', () => {
    expect(scoreListing({ id: 'l3' }, profile())).toBeNull();
    expect(scoreListing({ id: 'l4', price: null }, profile())).toBeNull();
    expect(scoreListing({ id: 'l5', price: 0 }, profile())).toBeNull();
  });
});

describe('verdictForPrice', () => {
  const thresholds = { affordableMaxPrice: 400000, stretchMaxPrice: 460000, purchasePriceThreshold: 30000 };

  it('maps a price onto its band', () => {
    expect(verdictForPrice(350000, thresholds)).toBe('affordable');
    expect(verdictForPrice(400000, thresholds)).toBe('affordable');
    expect(verdictForPrice(400001, thresholds)).toBe('stretch');
    expect(verdictForPrice(460000, thresholds)).toBe('stretch');
    expect(verdictForPrice(460001, thresholds)).toBe('unaffordable');
  });

  it('has no verdict for a rental, and none without thresholds', () => {
    expect(verdictForPrice(1200, thresholds)).toBeNull();
    expect(verdictForPrice(350000, null)).toBeNull();
    expect(verdictForPrice(null, thresholds)).toBeNull();
  });
});
