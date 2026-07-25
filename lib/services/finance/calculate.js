/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  classify,
  computeBudget,
  debtFreeAges,
  existingDebtSchedule,
  maxAffordablePrice,
  priceThresholds,
  recommendRate,
} from './affordability.js';
import { calculateFinancing } from './financing.js';
import { normalizeProfile } from './profile.js';
import { num } from './constants.js';

/**
 * The one entry point that turns a stored profile into everything the UI, the HTTP route
 * and the MCP tool need.
 *
 * Lives in the core rather than in the route so the MCP adapter does not have to depend on
 * an HTTP module, and so all three callers demonstrably compute the same numbers.
 *
 * @param {import('../../types/finance.js').FinanceProfile} rawProfile
 * @returns {Object}
 */
export function computeFinanceResult(rawProfile) {
  const profile = normalizeProfile(rawProfile);
  const budget = computeBudget(profile);
  const debtSchedule = existingDebtSchedule(profile);

  // Once the consumer loan clears, its instalment can go into the mortgage instead.
  const rollOver = profile.rollFreedBudgetIntoMortgage && debtSchedule?.payoffMonths != null;
  const financing = calculateFinancing(
    profile.financing,
    rollOver ? { extraPayment: budget.existingDebtRate, extraFromMonth: debtSchedule.payoffMonths + 1 } : {},
  );

  const primary = financing.primary;
  const recommendation = recommendRate(budget, {
    annualRate: primary.annualRate,
    loanAmount: financing.loanAmount,
  });

  /*
   * The term comes straight from the chosen scenario now. Rate and Tilgung are the same
   * quantity from opposite ends, so with both editable in the scenario the user sets the term
   * directly: raise the instalment and the years fall. No second "what you could afford" run is
   * needed, and no figure can silently disagree with the inputs on screen.
   */
  const rateAboveCeiling = primary.monthlyPayment > recommendation.recommendedRate;

  return {
    // True when the chosen instalment exceeds what the 35 % rule leaves for housing. Still
    // computed, since it is the user's choice, but worth flagging.
    rateAboveCeiling,
    profile,
    budget,
    financing,
    existingDebt: debtSchedule
      ? {
          payoffMonths: debtSchedule.payoffMonths,
          totalInterest: debtSchedule.totalInterest,
          neverPaysOff: debtSchedule.neverPaysOff,
          rolledIntoMortgage: rollOver === true,
        }
      : null,
    recommendation: {
      ...recommendation,
      maxAffordablePrice: maxAffordablePrice(budget, profile.financing),
    },
    verdict: classify(primary.monthlyPayment, budget),
    rateShareOfNetIncome:
      budget.netIncome > 0 ? (primary.monthlyPayment + budget.existingDebtRate) / budget.netIncome : null,
    debtFreeAges: debtFreeAges(profile, primary.payoffMonths),
    thresholds: priceThresholds(profile, profile.financing),
  };
}

/**
 * Reject input that would produce a meaningless answer.
 *
 * The calculator is forgiving by design - a missing field falls back to a default - but a
 * negative price or a 900 % interest rate is a mistake worth surfacing as an error rather
 * than rendering as a confusing chart.
 *
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @returns {string|null} An error message, or null when the input is usable.
 */
export function validateProfile(profile) {
  const financing = profile?.financing || {};
  if (num(financing.purchasePrice) < 0) {
    return 'purchasePrice must not be negative.';
  }
  if (num(financing.equity) < 0) {
    return 'equity must not be negative.';
  }
  if (num(profile?.livingCosts) < 0) {
    return 'livingCosts must not be negative.';
  }
  for (const person of [profile?.personA, profile?.personB]) {
    if (person == null) {
      continue;
    }
    const age = num(person.age);
    if (age < 16 || age > 99) {
      return 'age must be between 16 and 99.';
    }
    if (num(person.primaryIncome) < 0 || num(person.secondaryIncome) < 0) {
      return 'income must not be negative.';
    }
  }
  for (const scenario of Array.isArray(financing.scenarios) ? financing.scenarios : []) {
    const rate = num(scenario?.annualRate);
    if (rate < 0 || rate > 100) {
      return 'annualRate must be between 0 and 100.';
    }
    const tilgung = num(scenario?.tilgung);
    if (tilgung < 0 || tilgung > 100) {
      return 'tilgung must be between 0 and 100.';
    }
  }
  return null;
}
