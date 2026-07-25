/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { MAX_SIMULATION_MONTHS, num, toFraction } from './constants.js';

/**
 * Monthly annuity for a German Annuitätendarlehen.
 *
 * The rate a bank quotes is `Sollzins + anfängliche Tilgung`, applied to the original
 * loan amount and then held constant. As the balance shrinks the interest share falls
 * and the principal share grows, which is why the payoff accelerates towards the end.
 *
 * @param {number} principal Loan amount in EUR.
 * @param {number} annualRate Nominal interest rate in percent (e.g. 3.8).
 * @param {number} initialTilgung Initial amortization in percent per year (e.g. 2.0).
 * @returns {number} Monthly payment in EUR.
 */
export function annuity(principal, annualRate, initialTilgung) {
  return (num(principal) * (toFraction(annualRate) + toFraction(initialTilgung))) / 12;
}

/**
 * Simulate an annuity loan month by month.
 *
 * Handles what decides the real cost of a German mortgage: the fixed-rate period
 * (`fixedYears`), whose closing balance is the Restschuld, the annual Sondertilgung, and an
 * optional extra payment from a given month (used when consumer debt is paid off and its
 * instalment is rolled into the mortgage).
 *
 * The Sollzins applies for the whole term. What a follow-up loan would cost after the
 * Zinsbindung is unknowable, so this does not pretend to model it - the Restschuld is the
 * honest number to hand the user at that point.
 *
 * A loan whose payment does not cover the monthly interest never amortizes. Rather than
 * looping forever this returns `neverPaysOff: true` with a schedule showing the balance
 * growing, which is the honest picture to put in front of the user.
 *
 * @param {Object} options
 * @param {number} options.principal Loan amount in EUR.
 * @param {number} options.annualRate Nominal interest rate in percent.
 * @param {number} [options.initialTilgung] Initial amortization in percent per year. Ignored when `monthlyPayment` is given.
 * @param {number} [options.monthlyPayment] Explicit monthly payment in EUR, overriding the annuity formula.
 * @param {number} [options.fixedYears] Zinsbindung in years. The balance at its end is the Restschuld.
 * @param {number} [options.sondertilgungPerYear] Extra repayment in EUR applied every 12th month.
 * @param {number} [options.extraPayment] Additional monthly payment in EUR from `extraFromMonth` onwards.
 * @param {number} [options.extraFromMonth] First month (1-based) at which `extraPayment` applies.
 * @param {number} [options.maxMonths] Simulation ceiling in months.
 * @returns {import('../../types/finance.js').AmortizationSchedule}
 */
export function buildSchedule({
  principal,
  annualRate,
  initialTilgung = null,
  monthlyPayment = null,
  fixedYears = null,
  sondertilgungPerYear = 0,
  extraPayment = 0,
  extraFromMonth = null,
  maxMonths = MAX_SIMULATION_MONTHS,
} = {}) {
  const loan = num(principal);
  const basePayment =
    monthlyPayment != null && num(monthlyPayment) > 0 ? num(monthlyPayment) : annuity(loan, annualRate, initialTilgung);

  if (loan <= 0) {
    return {
      monthlyPayment: 0,
      months: [],
      payoffMonths: 0,
      totalInterest: 0,
      totalPaid: 0,
      restschuld: 0,
      restschuldAtMonth: null,
      neverPaysOff: false,
    };
  }

  const rate = toFraction(annualRate);
  const fixedMonths = num(fixedYears) > 0 ? Math.round(num(fixedYears) * 12) : null;
  const sondertilgung = Math.max(0, num(sondertilgungPerYear));
  const extra = Math.max(0, num(extraPayment));
  const extraStart = extraFromMonth == null ? null : Math.max(1, Math.round(num(extraFromMonth)));
  const ceiling = Math.max(1, Math.round(num(maxMonths, MAX_SIMULATION_MONTHS)));

  const months = [];
  let balance = loan;
  let totalInterest = 0;
  let totalPaid = 0;
  let payoffMonths = null;
  let restschuld = null;
  let restschuldAtMonth = null;

  for (let month = 1; month <= ceiling; month++) {
    const interest = (balance * rate) / 12;

    let payment = basePayment;
    if (extra > 0 && extraStart != null && month >= extraStart) {
      payment += extra;
    }

    let principalPart = payment - interest;

    // Last regular instalment: never overpay past zero.
    if (principalPart >= balance) {
      principalPart = balance;
      payment = interest + principalPart;
    }

    balance -= principalPart;
    totalInterest += interest;
    totalPaid += payment;

    // Sondertilgung lands once a year, on top of the regular instalment.
    if (sondertilgung > 0 && balance > 0 && month % 12 === 0) {
      const applied = Math.min(sondertilgung, balance);
      balance -= applied;
      totalPaid += applied;
      principalPart += applied;
      payment += applied;
    }

    months.push({
      month,
      interest,
      principal: principalPart,
      payment,
      balance: balance > 0 ? balance : 0,
    });

    if (fixedMonths != null && month === fixedMonths) {
      restschuld = balance > 0 ? balance : 0;
      restschuldAtMonth = month;
    }

    if (balance <= 0) {
      payoffMonths = month;
      break;
    }
  }

  // Zinsbindung outlasts the loan: nothing is left owing when the fixed period ends.
  if (fixedMonths != null && restschuld == null && payoffMonths != null && payoffMonths < fixedMonths) {
    restschuld = 0;
    restschuldAtMonth = fixedMonths;
  }

  return {
    monthlyPayment: basePayment,
    months,
    payoffMonths,
    totalInterest,
    totalPaid,
    restschuld,
    restschuldAtMonth,
    neverPaysOff: payoffMonths == null,
  };
}

/**
 * Collapse a monthly schedule into calendar years, for the stacked interest/principal
 * chart and for the yearly x-axis of the debt trajectory.
 *
 * @param {Array<{month: number, interest: number, principal: number, balance: number}>} months
 * @returns {Array<{year: number, interest: number, principal: number, balance: number}>}
 */
export function aggregateByYear(months = []) {
  const years = [];
  for (const entry of months) {
    const year = Math.ceil(entry.month / 12);
    let bucket = years[year - 1];
    if (bucket == null) {
      bucket = { year, interest: 0, principal: 0, balance: 0 };
      years[year - 1] = bucket;
    }
    bucket.interest += entry.interest;
    bucket.principal += entry.principal;
    // The balance of a year is whatever is left after its last instalment.
    bucket.balance = entry.balance;
  }
  return years.filter(Boolean);
}

/**
 * Convert a month count into whole years with one decimal, for display.
 *
 * @param {number|null} monthCount
 * @returns {number|null} `null` when the loan never pays off.
 */
export function monthsToYears(monthCount) {
  if (monthCount == null || !Number.isFinite(Number(monthCount))) {
    return null;
  }
  return Math.round((Number(monthCount) / 12) * 10) / 10;
}
