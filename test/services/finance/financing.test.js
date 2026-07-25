/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  calculateFinancing,
  closingCosts,
  grunderwerbsteuerPct,
  normalizeScenario,
} from '../../../lib/services/finance/financing.js';
import { DEFAULT_MAKLER_PCT, DEFAULT_NOTARY_PCT, DEFAULT_TILGUNG } from '../../../lib/services/finance/constants.js';

const params = (overrides = {}) => ({
  purchasePrice: 400000,
  equity: 80000,
  bundesland: 'NW',
  notaryPct: DEFAULT_NOTARY_PCT,
  maklerPct: DEFAULT_MAKLER_PCT,
  scenarios: [{ id: 'mid', annualRate: 3.8, tilgung: 2, fixedYears: 10 }],
  ...overrides,
});

describe('grunderwerbsteuerPct', () => {
  it('reads the rate from the Bundesland table', () => {
    expect(grunderwerbsteuerPct('NW')).toBe(6.5);
    expect(grunderwerbsteuerPct('BY')).toBe(3.5);
  });

  it('lets an explicit override win, so a stale table is never a blocker', () => {
    expect(grunderwerbsteuerPct('NW', 4.2)).toBe(4.2);
    expect(grunderwerbsteuerPct('NW', 0)).toBe(0);
  });

  it('falls back to zero for an unknown Bundesland', () => {
    expect(grunderwerbsteuerPct('XX')).toBe(0);
  });
});

describe('closingCosts', () => {
  it('adds up Grunderwerbsteuer, Notar and Makler', () => {
    const costs = closingCosts(400000, { bundesland: 'NW' });

    expect(costs.grunderwerbsteuer).toBeCloseTo(26000, 2); // 6,5 %
    expect(costs.notar).toBeCloseTo(6000, 2); // 1,5 %
    expect(costs.makler).toBeCloseTo(14280, 2); // 3,57 %
    expect(costs.total).toBeCloseTo(46280, 2);
    expect(costs.totalPct).toBeCloseTo(11.57, 6);
  });

  it('differs by Bundesland on an identical price', () => {
    const nw = closingCosts(400000, { bundesland: 'NW' });
    const by = closingCosts(400000, { bundesland: 'BY' });

    // 6,5 % vs 3,5 % Grunderwerbsteuer is 12.000 EUR on this purchase.
    expect(nw.total - by.total).toBeCloseTo(12000, 2);
  });

  it('drops the commission on a private sale', () => {
    const costs = closingCosts(400000, { bundesland: 'NW', maklerPct: 0 });

    expect(costs.makler).toBe(0);
    expect(costs.total).toBeCloseTo(32000, 2);
  });

  it('is linear in the purchase price', () => {
    const single = closingCosts(100000, { bundesland: 'NW' }).total;
    const double = closingCosts(200000, { bundesland: 'NW' }).total;

    expect(double).toBeCloseTo(single * 2, 6);
  });

  it('treats a negative price as zero', () => {
    expect(closingCosts(-5000, { bundesland: 'NW' }).total).toBe(0);
  });
});

describe('normalizeScenario', () => {
  it('fills in the defaults a bank would quote', () => {
    const scenario = normalizeScenario({ annualRate: 3.8 }, 0);

    expect(scenario.tilgung).toBe(DEFAULT_TILGUNG);
    expect(scenario.monthlyPayment).toBeNull();
    expect(scenario.id).toBe('scenario-1');
    expect(scenario.sondertilgungPerYear).toBe(0);
  });
});

describe('calculateFinancing', () => {
  it('sizes the loan from price plus Kaufnebenkosten minus Eigenkapital', () => {
    const result = calculateFinancing(params());

    expect(result.totalCost).toBeCloseTo(446280, 2);
    expect(result.loanAmount).toBeCloseTo(366280, 2);
    expect(result.equityRatio).toBeCloseTo(80000 / 446280, 6);
  });

  it('never returns a negative loan when equity exceeds the total cost', () => {
    const result = calculateFinancing(params({ equity: 600000 }));

    expect(result.loanAmount).toBe(0);
    expect(result.primary.payoffMonths).toBe(0);
    expect(result.primary.neverPaysOff).toBe(false);
  });

  it('simulates every scenario against the same loan', () => {
    const result = calculateFinancing(
      params({
        scenarios: [
          { id: 'low', annualRate: 3.0, tilgung: 2, fixedYears: 10 },
          { id: 'high', annualRate: 4.6, tilgung: 2, fixedYears: 10 },
        ],
      }),
    );

    expect(result.scenarios).toHaveLength(2);
    // Same loan, so a higher interest rate costs more per month and more in total.
    expect(result.scenarios[1].monthlyPayment).toBeGreaterThan(result.scenarios[0].monthlyPayment);
    expect(result.scenarios[1].totalInterest).toBeGreaterThan(result.scenarios[0].totalInterest);
  });

  it('leaves a smaller Restschuld at the higher rate, because the annuity is bigger', () => {
    const result = calculateFinancing(
      params({
        scenarios: [
          { id: 'low', annualRate: 3.0, tilgung: 2, fixedYears: 10 },
          { id: 'high', annualRate: 4.6, tilgung: 2, fixedYears: 10 },
        ],
      }),
    );

    // Counterintuitive but correct: with the anfängliche Tilgung fixed at 2 %, both loans
    // repay exactly the same principal in month one (loan * 2 % / 12). The dearer loan has
    // the larger instalment, so its principal share compounds faster and it stands lower
    // after ten years - while still having cost far more in interest to get there.
    expect(result.scenarios[0].schedule.months[0].principal).toBeCloseTo(
      result.scenarios[1].schedule.months[0].principal,
      6,
    );
    expect(result.scenarios[1].restschuld).toBeLessThan(result.scenarios[0].restschuld);
    expect(result.scenarios[1].payoffMonths).toBeLessThan(result.scenarios[0].payoffMonths);
  });

  it('exposes the first scenario as the primary one', () => {
    const result = calculateFinancing(params());

    expect(result.primary).toBe(result.scenarios[0]);
  });

  it('falls back to a default scenario when none is given', () => {
    const result = calculateFinancing(params({ scenarios: [] }));

    expect(result.scenarios).toHaveLength(1);
    expect(result.primary.monthlyPayment).toBeGreaterThan(0);
  });

  it('increases the monthly payment monotonically with the purchase price', () => {
    let previous = 0;
    for (const purchasePrice of [200000, 300000, 400000, 500000, 600000]) {
      const { primary } = calculateFinancing(params({ purchasePrice }));
      expect(primary.monthlyPayment).toBeGreaterThan(previous);
      previous = primary.monthlyPayment;
    }
  });
});
