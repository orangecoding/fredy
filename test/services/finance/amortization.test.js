/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { aggregateByYear, annuity, buildSchedule, monthsToYears } from '../../../lib/services/finance/amortization.js';
import { MAX_SIMULATION_MONTHS } from '../../../lib/services/finance/constants.js';

describe('annuity', () => {
  it('matches the rate a bank quotes for Sollzins + Tilgung', () => {
    // 300.000 EUR at 3,5 % Sollzins and 2 % anfängliche Tilgung is the textbook example.
    expect(annuity(300000, 3.5, 2)).toBeCloseTo(1375, 2);
  });
});

describe('buildSchedule', () => {
  it('amortizes a standard Annuitätendarlehen', () => {
    const schedule = buildSchedule({ principal: 300000, annualRate: 3.5, initialTilgung: 2, fixedYears: 10 });

    expect(schedule.monthlyPayment).toBeCloseTo(1375, 2);
    expect(schedule.neverPaysOff).toBe(false);
    // Published calculators put this loan at just over 29 years.
    expect(monthsToYears(schedule.payoffMonths)).toBeCloseTo(29, 0);
    // Every cent of the loan is repaid, no more and no less.
    expect(schedule.months.reduce((sum, m) => sum + m.principal, 0)).toBeCloseTo(300000, 2);
  });

  it('reports the Restschuld at the end of the Zinsbindung', () => {
    const schedule = buildSchedule({ principal: 300000, annualRate: 3.5, initialTilgung: 2, fixedYears: 10 });

    expect(schedule.restschuldAtMonth).toBe(120);
    expect(schedule.restschuld).toBeCloseTo(228283.74, 0);
    // The Restschuld is exactly the balance carried out of month 120.
    expect(schedule.restschuld).toBeCloseTo(schedule.months[119].balance, 6);
  });

  it('leaves no Restschuld when the loan clears before the Zinsbindung ends', () => {
    const schedule = buildSchedule({ principal: 10000, annualRate: 3.5, monthlyPayment: 2000, fixedYears: 10 });

    expect(schedule.payoffMonths).toBeLessThan(120);
    expect(schedule.restschuld).toBe(0);
  });

  it('shifts the interest/principal split towards principal over time', () => {
    const { months } = buildSchedule({ principal: 300000, annualRate: 3.5, initialTilgung: 2 });

    expect(months[0].interest).toBeGreaterThan(months[0].principal);
    const last = months[months.length - 1];
    expect(last.principal).toBeGreaterThan(last.interest);
  });

  it('decreases the balance monotonically', () => {
    const { months } = buildSchedule({ principal: 250000, annualRate: 4, initialTilgung: 2 });

    for (let i = 1; i < months.length; i++) {
      expect(months[i].balance).toBeLessThanOrEqual(months[i - 1].balance);
    }
    expect(months[months.length - 1].balance).toBe(0);
  });

  it('shortens the payoff when Sondertilgung is used', () => {
    const without = buildSchedule({ principal: 300000, annualRate: 3.5, initialTilgung: 2 });
    const with5k = buildSchedule({ principal: 300000, annualRate: 3.5, initialTilgung: 2, sondertilgungPerYear: 5000 });

    expect(with5k.payoffMonths).toBeLessThan(without.payoffMonths);
    expect(with5k.totalInterest).toBeLessThan(without.totalInterest);
  });

  it('applies an extra payment only from the month it starts', () => {
    const baseline = buildSchedule({ principal: 200000, annualRate: 3.5, initialTilgung: 2 });
    const rolled = buildSchedule({
      principal: 200000,
      annualRate: 3.5,
      initialTilgung: 2,
      extraPayment: 250,
      extraFromMonth: 25,
    });

    // Identical until the extra kicks in, faster afterwards.
    expect(rolled.months[10].balance).toBeCloseTo(baseline.months[10].balance, 6);
    expect(rolled.payoffMonths).toBeLessThan(baseline.payoffMonths);
  });

  it('flags a loan whose instalment never covers the interest', () => {
    const schedule = buildSchedule({ principal: 300000, annualRate: 3.5, initialTilgung: 0 });

    expect(schedule.neverPaysOff).toBe(true);
    expect(schedule.payoffMonths).toBeNull();
    // It stops at the ceiling instead of looping forever.
    expect(schedule.months.length).toBe(MAX_SIMULATION_MONTHS);
  });

  it('never overpays past zero on the final instalment', () => {
    const schedule = buildSchedule({ principal: 5000, annualRate: 3, monthlyPayment: 2000 });
    const last = schedule.months[schedule.months.length - 1];

    expect(last.balance).toBe(0);
    expect(last.payment).toBeLessThan(2000);
    expect(schedule.months.every((m) => m.balance >= 0)).toBe(true);
  });

  it('treats a zero loan as already repaid', () => {
    const schedule = buildSchedule({ principal: 0, annualRate: 3.5, initialTilgung: 2 });

    expect(schedule.payoffMonths).toBe(0);
    expect(schedule.months).toEqual([]);
    expect(schedule.neverPaysOff).toBe(false);
  });
});

describe('aggregateByYear', () => {
  it('buckets months into years and carries the year-end balance', () => {
    const { months } = buildSchedule({ principal: 300000, annualRate: 3.5, initialTilgung: 2 });
    const years = aggregateByYear(months);

    expect(years[0].year).toBe(1);
    expect(years[0].interest + years[0].principal).toBeCloseTo(1375 * 12, 2);
    expect(years[0].balance).toBeCloseTo(months[11].balance, 6);
    expect(years.length).toBe(Math.ceil(months.length / 12));
  });

  it('returns nothing for an empty schedule', () => {
    expect(aggregateByYear([])).toEqual([]);
  });
});

describe('monthsToYears', () => {
  it('converts months to years with one decimal', () => {
    expect(monthsToYears(120)).toBe(10);
    expect(monthsToYears(126)).toBe(10.5);
  });

  it('passes through null for a loan that never pays off', () => {
    expect(monthsToYears(null)).toBeNull();
  });
});
