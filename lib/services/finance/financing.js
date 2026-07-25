/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  DEFAULT_MAKLER_PCT,
  DEFAULT_NOTARY_PCT,
  DEFAULT_RATE,
  DEFAULT_TILGUNG,
  DEFAULT_ZINSBINDUNG_YEARS,
  GRUNDERWERBSTEUER,
  num,
  toFraction,
} from './constants.js';
import { buildSchedule } from './amortization.js';

/**
 * Resolve the Grunderwerbsteuer rate to apply.
 *
 * An explicit override always wins, so a stale entry in the built-in table is never a
 * blocker - the user can type the correct rate and get a correct result.
 *
 * @param {string} bundesland Two-letter code, e.g. 'NW'.
 * @param {number} [override] Explicit rate in percent.
 * @returns {number} Rate in percent.
 */
export function grunderwerbsteuerPct(bundesland, override) {
  if (override != null && Number.isFinite(Number(override))) {
    return Number(override);
  }
  return GRUNDERWERBSTEUER[bundesland] ?? 0;
}

/**
 * The Kaufnebenkosten of a German property purchase.
 *
 * These are the costs the issue's original model left out, and they are the reason a
 * naive calculation is wrong by 10-15 %: on a 400.000 EUR house in NRW they add roughly
 * 46.000 EUR that has to be financed or covered by equity.
 *
 * @param {number} purchasePrice
 * @param {Object} params
 * @param {string} [params.bundesland]
 * @param {number} [params.grunderwerbsteuerPct] Override in percent.
 * @param {number} [params.notaryPct] Notar + Grundbuch in percent.
 * @param {number} [params.maklerPct] Buyer's share of the agent commission in percent.
 * @returns {{grunderwerbsteuer: number, notar: number, makler: number, total: number, totalPct: number}}
 */
export function closingCosts(purchasePrice, params = {}) {
  const price = Math.max(0, num(purchasePrice));
  const taxPct = grunderwerbsteuerPct(params.bundesland, params.grunderwerbsteuerPct);
  const notarPct = num(params.notaryPct, DEFAULT_NOTARY_PCT);
  const maklerPct = num(params.maklerPct, DEFAULT_MAKLER_PCT);

  const grunderwerbsteuer = price * toFraction(taxPct);
  const notar = price * toFraction(notarPct);
  const makler = price * toFraction(maklerPct);

  return {
    grunderwerbsteuer,
    notar,
    makler,
    total: grunderwerbsteuer + notar + makler,
    totalPct: taxPct + notarPct + maklerPct,
  };
}

/**
 * Normalize a rate scenario, filling in the defaults a bank would quote.
 *
 * @param {Partial<import('../../types/finance.js').RateScenario>} scenario
 * @param {number} index
 * @returns {import('../../types/finance.js').RateScenario}
 */
export function normalizeScenario(scenario = {}, index = 0) {
  const annualRate = num(scenario.annualRate, DEFAULT_RATE);
  return {
    id: scenario.id ?? `scenario-${index + 1}`,
    label: scenario.label ?? `${annualRate} %`,
    annualRate,
    tilgung: num(scenario.tilgung, DEFAULT_TILGUNG),
    fixedYears: num(scenario.fixedYears, DEFAULT_ZINSBINDUNG_YEARS),
    // An explicit instalment overrides the Tilgung. The two are the same quantity seen from
    // different ends, so only one of them can be the source of truth at a time.
    monthlyPayment: scenario.monthlyPayment == null ? null : Math.max(0, num(scenario.monthlyPayment)),
    sondertilgungPerYear: Math.max(0, num(scenario.sondertilgungPerYear)),
  };
}

/**
 * The Tilgung that a given monthly instalment amounts to.
 *
 * Inverse of {@link annuity}. Lets the UI offer both fields and keep them in step: type a
 * Tilgung and the instalment follows, type an instalment and the Tilgung follows.
 *
 * @param {number} loanAmount
 * @param {number} annualRate Sollzins in percent.
 * @param {number} monthlyPayment
 * @returns {number} Tilgung in percent per year; 0 when the instalment only covers interest.
 */
export function tilgungFromPayment(loanAmount, annualRate, monthlyPayment) {
  const loan = num(loanAmount);
  if (loan <= 0) {
    return 0;
  }
  const tilgungFraction = (num(monthlyPayment) * 12) / loan - toFraction(annualRate);
  return Math.max(0, Math.round(tilgungFraction * 100 * 100) / 100);
}

/**
 * Size the loan and simulate every interest scenario against it.
 *
 * @param {import('../../types/finance.js').FinancingParams} params
 * @param {Object} [options]
 * @param {number} [options.extraPayment] Additional monthly payment (e.g. freed consumer-debt budget).
 * @param {number} [options.extraFromMonth] Month at which `extraPayment` starts.
 * @returns {import('../../types/finance.js').FinancingResult}
 */
export function calculateFinancing(params = {}, options = {}) {
  const purchasePrice = Math.max(0, num(params.purchasePrice));
  const equity = Math.max(0, num(params.equity));
  const costs = closingCosts(purchasePrice, params);
  const totalCost = purchasePrice + costs.total;
  const loanAmount = Math.max(0, totalCost - equity);

  const rawScenarios = Array.isArray(params.scenarios) && params.scenarios.length > 0 ? params.scenarios : [{}];

  const scenarios = rawScenarios.map((raw, index) => {
    const scenario = normalizeScenario(raw, index);
    const schedule = buildSchedule({
      principal: loanAmount,
      annualRate: scenario.annualRate,
      initialTilgung: scenario.tilgung,
      monthlyPayment: scenario.monthlyPayment,
      fixedYears: scenario.fixedYears,
      sondertilgungPerYear: scenario.sondertilgungPerYear,
      extraPayment: options.extraPayment,
      extraFromMonth: options.extraFromMonth,
    });
    return {
      ...scenario,
      schedule,
      monthlyPayment: schedule.monthlyPayment,
      // Whichever field the user did not set is reported back, so the form can show both.
      tilgung:
        scenario.monthlyPayment != null
          ? tilgungFromPayment(loanAmount, scenario.annualRate, schedule.monthlyPayment)
          : scenario.tilgung,
      payoffMonths: schedule.payoffMonths,
      totalInterest: schedule.totalInterest,
      restschuld: schedule.restschuld,
      neverPaysOff: schedule.neverPaysOff,
    };
  });

  return {
    purchasePrice,
    equity,
    closingCosts: costs,
    totalCost,
    loanAmount,
    // Share of the total cost covered from own funds. Banks start asking questions below ~20 %.
    equityRatio: totalCost > 0 ? equity / totalCost : 0,
    scenarios,
    primary: scenarios[0],
  };
}
