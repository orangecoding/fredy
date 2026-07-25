/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { computeFinanceResult } from '../../../lib/services/finance/calculate.js';
import { monthsToYears } from '../../../lib/services/finance/amortization.js';
import { tilgungFromPayment } from '../../../lib/services/finance/financing.js';

const profile = (scenario = {}, overrides = {}) => ({
  personA: { label: 'A', enabled: true, age: 35, primaryIncome: 10000, secondaryIncome: 0 },
  personB: { enabled: false },
  livingCosts: 1500,
  existingDebt: 0,
  existingDebtRate: 0,
  financing: {
    purchasePrice: 380000,
    equity: 250000,
    bundesland: 'NW',
    notaryPct: 1.5,
    maklerPct: 3.57,
    scenarios: [{ id: 'mid', annualRate: 3.8, tilgung: 2, fixedYears: 10, ...scenario }],
  },
  ...overrides,
});

// Tilgung and instalment are the same quantity from opposite ends. Whichever the user sets has
// to drive the term, otherwise the figures contradict the inputs on screen.
describe('the scenario instalment drives the term', () => {
  it('derives the instalment from the Tilgung when no rate is pinned', () => {
    const result = computeFinanceResult(profile());

    expect(result.financing.loanAmount).toBeCloseTo(173966, 0);
    expect(Math.round(result.financing.primary.monthlyPayment)).toBe(841);
    expect(monthsToYears(result.financing.primary.payoffMonths)).toBeCloseTo(28.1, 1);
  });

  it('honours an explicit monthly rate and shortens the term accordingly', () => {
    const result = computeFinanceResult(profile({ monthlyPayment: 1135.5 }));

    expect(result.financing.primary.monthlyPayment).toBe(1135.5);
    expect(monthsToYears(result.financing.primary.payoffMonths)).toBeCloseTo(17.5, 1);
  });

  it('reports back the Tilgung that an explicit rate amounts to', () => {
    const result = computeFinanceResult(profile({ monthlyPayment: 1135.5 }));

    // 1.135,50 a month on a 173.966 loan at 3,8 % is roughly 4 % Tilgung.
    expect(result.financing.primary.tilgung).toBeCloseTo(4, 1);
    expect(result.financing.primary.tilgung).toBe(tilgungFromPayment(173966.02, 3.8, 1135.5));
  });

  it('round-trips between the two fields', () => {
    const fromTilgung = computeFinanceResult(profile({ tilgung: 4 }));
    const payment = fromTilgung.financing.primary.monthlyPayment;
    const fromPayment = computeFinanceResult(profile({ monthlyPayment: payment }));

    expect(fromPayment.financing.primary.payoffMonths).toBe(fromTilgung.financing.primary.payoffMonths);
    expect(fromPayment.financing.primary.tilgung).toBeCloseTo(4, 1);
  });

  it('ages the household from that same term', () => {
    const slow = computeFinanceResult(profile());
    const fast = computeFinanceResult(profile({ monthlyPayment: 3500 }));

    expect(slow.debtFreeAges[0].ageWhenDebtFree).toBe(64);
    expect(fast.debtFreeAges[0].ageWhenDebtFree).toBeLessThan(41);
  });

  it('flags an instalment above what the 35 % rule allows', () => {
    expect(computeFinanceResult(profile({ monthlyPayment: 6000 })).rateAboveCeiling).toBe(true);
    expect(computeFinanceResult(profile({ monthlyPayment: 1135.5 })).rateAboveCeiling).toBe(false);
  });

  it('still reports a term that never ends when the instalment misses the interest', () => {
    // 173.966 at 3,8 % costs ~551 EUR of interest a month, so 300 never touches the principal.
    const result = computeFinanceResult(profile({ monthlyPayment: 300 }));

    expect(result.financing.primary.neverPaysOff).toBe(true);
    expect(result.financing.primary.payoffMonths).toBeNull();
    expect(result.debtFreeAges[0].ageWhenDebtFree).toBeNull();
  });

  it('keeps the Restschuld tied to the Zinsbindung, not to the term', () => {
    const result = computeFinanceResult(profile({ monthlyPayment: 1135.5 }));

    expect(result.financing.primary.restschuldAtMonth ?? result.financing.primary.schedule.restschuldAtMonth).toBe(120);
    expect(result.financing.primary.restschuld).toBeGreaterThan(0);
  });
});
