/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  classify,
  computeBudget,
  priceForMonthlyRate,
  priceThresholds,
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

describe('priceForMonthlyRate', () => {
  it('inverts the forward calculation exactly', () => {
    const { financing } = profile();
    const price = priceForMonthlyRate(1780, financing);
    const { primary } = calculateFinancing({ ...financing, purchasePrice: price });

    expect(primary.monthlyPayment).toBeCloseTo(1780, 6);
  });

  it('is zero for a non-positive rate', () => {
    expect(priceForMonthlyRate(0, profile().financing)).toBe(0);
    expect(priceForMonthlyRate(-100, profile().financing)).toBe(0);
  });

  it('is zero when neither interest nor Tilgung is set, instead of dividing by zero', () => {
    const financing = { ...profile().financing, scenarios: [{ annualRate: 0, tilgung: 0 }] };
    expect(priceForMonthlyRate(1500, financing)).toBe(0);
  });
});

describe('priceThresholds', () => {
  it('orders the two bands', () => {
    const thresholds = priceThresholds(profile());

    expect(thresholds.affordableMaxPrice).toBeGreaterThan(0);
    expect(thresholds.stretchMaxPrice).toBeGreaterThanOrEqual(thresholds.affordableMaxPrice);
    expect(thresholds.purchasePriceThreshold).toBe(30000);
  });

  it('has no answer for an incomplete profile', () => {
    expect(priceThresholds({})).toBeNull();
    expect(priceThresholds(null)).toBeNull();
    expect(
      priceThresholds(
        profile({
          personA: { enabled: true, age: 30, primaryIncome: 0, secondaryIncome: 0 },
          personB: { enabled: false, age: 30, primaryIncome: 0, secondaryIncome: 0 },
        }),
      ),
    ).toBeNull();
  });

  it('collapses both bands to the same cash ceiling when living costs dominate', () => {
    // Disposable income, not the rule, is the binding constraint here.
    const thresholds = priceThresholds(profile({ livingCosts: 4000 }));
    expect(thresholds.affordableMaxPrice).toBeCloseTo(thresholds.stretchMaxPrice, 6);
  });

  it('falls back to the default rental threshold when none is configured', () => {
    const p = profile();
    delete p.financing.purchasePriceThreshold;
    expect(priceThresholds(p).purchasePriceThreshold).toBe(30000);
  });
});

describe('threshold / simulation consistency', () => {
  // This is the invariant the whole listings filter rests on. The filter turns a verdict
  // into a plain SQL price range, while the detail page runs the full simulation. If these
  // two ever disagreed, a listing could be filtered in as "affordable" and then show an
  // "out of reach" badge when opened.
  it('gives the same verdict from the thresholds as from a full simulation, across the whole price range', () => {
    const p = profile();
    const thresholds = priceThresholds(p);
    const mismatches = [];

    for (let price = 30000; price <= 900000; price += 1000) {
      const fromThresholds = verdictForPrice(price, thresholds);
      const fromSimulation = scoreListing({ price }, p).verdict;
      if (fromThresholds !== fromSimulation) {
        mismatches.push({ price, fromThresholds, fromSimulation });
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('holds for a single earner with no equity and no existing debt too', () => {
    const p = profile({
      personB: { enabled: false, age: 36, primaryIncome: 0, secondaryIncome: 0 },
      existingDebt: 0,
      existingDebtRate: 0,
      livingCosts: 900,
      financing: { ...profile().financing, equity: 0, bundesland: 'BY', maklerPct: 0 },
    });
    const thresholds = priceThresholds(p);
    const mismatches = [];

    for (let price = 30000; price <= 600000; price += 1000) {
      if (verdictForPrice(price, thresholds) !== scoreListing({ price }, p).verdict) {
        mismatches.push(price);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('keeps the monthly rate monotonic in price, which is what makes the range filter valid', () => {
    const p = profile();
    let previous = -1;
    for (let price = 30000; price <= 900000; price += 10000) {
      const { monthlyPayment } = scoreListing({ price }, p);
      expect(monthlyPayment).toBeGreaterThanOrEqual(previous);
      previous = monthlyPayment;
    }
  });

  it('is strictly increasing once the price exceeds what the equity alone covers', () => {
    const p = profile();
    // Below ~71.700 EUR the 80.000 EUR equity covers price plus Kaufnebenkosten outright, so
    // there is no loan and the rate is flat at zero. Above it, every euro of price costs more.
    let previous = 0;
    for (let price = 100000; price <= 900000; price += 10000) {
      const { monthlyPayment } = scoreListing({ price }, p);
      expect(monthlyPayment).toBeGreaterThan(previous);
      previous = monthlyPayment;
    }
    expect(scoreListing({ price: 50000 }, p).monthlyPayment).toBe(0);
  });

  it('puts the affordable ceiling exactly on the 35 % boundary', () => {
    const p = profile();
    const budget = computeBudget(p);
    const { affordableMaxPrice } = priceThresholds(p);

    const atCeiling = scoreListing({ price: affordableMaxPrice }, p);
    const justAbove = scoreListing({ price: affordableMaxPrice + 1000 }, p);

    expect(classify(atCeiling.monthlyPayment, budget)).toBe('affordable');
    expect(classify(justAbove.monthlyPayment, budget)).not.toBe('affordable');
  });
});
