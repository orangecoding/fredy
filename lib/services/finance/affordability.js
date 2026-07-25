/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  AFFORDABILITY_RULE,
  DEFAULT_NEBENKOSTEN_PCT,
  DEFAULT_PURCHASE_PRICE_THRESHOLD,
  DEFAULT_SAFETY_BUFFER,
  GRUNDERWERBSTEUER,
  num,
  toFraction,
} from './constants.js';
import { DEAL_TYPES } from '../dealType.js';
import { buildSchedule, monthsToYears } from './amortization.js';
import { calculateFinancing, closingCosts, normalizeScenario } from './financing.js';

/**
 * The people whose income counts towards the budget. Person B is optional and only
 * included when the user explicitly enabled the partner.
 *
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @returns {import('../../types/finance.js').Person[]}
 */
export function activePersons(profile = {}) {
  const persons = [];
  if (profile.personA) {
    persons.push(profile.personA);
  }
  if (profile.personB && profile.personB.enabled) {
    persons.push(profile.personB);
  }
  return persons;
}

/**
 * Monthly net income of the household.
 *
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @returns {number}
 */
export function netIncomeOf(profile = {}) {
  return activePersons(profile).reduce(
    (sum, person) => sum + Math.max(0, num(person?.primaryIncome)) + Math.max(0, num(person?.secondaryIncome)),
    0,
  );
}

/**
 * The household budget the affordability rule is applied against.
 *
 * `headroom` is what the 35 % rule leaves for housing once existing debt service is
 * subtracted; `disposable` is what is physically left after living costs. A purchase has
 * to fit inside both - the rule alone would happily approve a rate the household cannot
 * actually pay.
 *
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @returns {import('../../types/finance.js').Budget}
 */
export function computeBudget(profile = {}) {
  const netIncome = netIncomeOf(profile);
  const livingCosts = Math.max(0, num(profile.livingCosts));
  const existingDebtRate = Math.max(0, num(profile.existingDebtRate));
  const ruleCap = netIncome * AFFORDABILITY_RULE.cap;
  const stretchCap = netIncome * AFFORDABILITY_RULE.stretch;

  return {
    netIncome,
    livingCosts,
    existingDebtRate,
    disposable: netIncome - livingCosts - existingDebtRate,
    ruleCap,
    stretchCap,
    headroom: ruleCap - existingDebtRate,
    stretchHeadroom: stretchCap - existingDebtRate,
  };
}

/**
 * Classify a monthly housing rate against the household budget.
 *
 * @param {number} monthlyRate Mortgage instalment in EUR.
 * @param {import('../../types/finance.js').Budget} budget
 * @returns {'affordable'|'stretch'|'unaffordable'}
 */
export function classify(monthlyRate, budget) {
  const rate = num(monthlyRate);
  if (!budget || budget.netIncome <= 0) {
    return 'unaffordable';
  }
  // Hard reality check first: the rule of thumb is meaningless if the money is not there.
  if (rate > budget.disposable) {
    return 'unaffordable';
  }
  const share = (rate + budget.existingDebtRate) / budget.netIncome;
  if (share <= AFFORDABILITY_RULE.cap) {
    return 'affordable';
  }
  if (share <= AFFORDABILITY_RULE.stretch) {
    return 'stretch';
  }
  return 'unaffordable';
}

/**
 * The monthly rate the household should aim for, and the Tilgung it buys.
 *
 * @param {import('../../types/finance.js').Budget} budget
 * @param {Object} [options]
 * @param {number} [options.annualRate] Interest rate in percent, to derive the implied Tilgung.
 * @param {number} [options.loanAmount] Loan amount in EUR, to derive the implied Tilgung.
 * @param {number} [options.safetyBuffer] Monthly buffer to keep free.
 * @returns {{recommendedRate: number, impliedTilgung: number|null, limitedBy: 'rule'|'disposable'}}
 */
export function recommendRate(budget, options = {}) {
  const safetyBuffer = num(options.safetyBuffer, DEFAULT_SAFETY_BUFFER);
  const byRule = budget.headroom;
  const byCash = budget.disposable - safetyBuffer;
  const recommendedRate = Math.max(0, Math.min(byRule, byCash));

  let impliedTilgung = null;
  const loanAmount = num(options.loanAmount);
  if (loanAmount > 0 && recommendedRate > 0) {
    // payment = loan * (rate + tilgung) / 12  ->  tilgung = payment * 12 / loan - rate
    const tilgungFraction = (recommendedRate * 12) / loanAmount - toFraction(options.annualRate);
    impliedTilgung = Math.round(tilgungFraction * 100 * 100) / 100;
  }

  return {
    recommendedRate,
    impliedTilgung,
    limitedBy: byRule <= byCash ? 'rule' : 'disposable',
  };
}

/**
 * Invert the annuity formula: the purchase price a given monthly rate can carry.
 *
 * `payment = loan * (rate + tilgung) / 12` and `loan = price * (1 + closingPct) - equity`,
 * both linear in price, so this is a closed form - no numeric solver, and no risk of it
 * disagreeing with the forward calculation.
 *
 * @param {number} monthlyRate
 * @param {import('../../types/finance.js').FinancingParams} financingParams
 * @returns {number} Purchase price in EUR, floored at 0.
 */
export function priceForMonthlyRate(monthlyRate, financingParams = {}) {
  const rate = num(monthlyRate);
  if (rate <= 0) {
    return 0;
  }
  const scenario = normalizeScenario((financingParams.scenarios || [])[0] || {}, 0);
  const annuityFraction = toFraction(scenario.annualRate) + toFraction(scenario.tilgung);
  if (annuityFraction <= 0) {
    return 0;
  }
  const loan = (rate * 12) / annuityFraction;
  const equity = Math.max(0, num(financingParams.equity));
  // closingCosts is linear in price, so evaluating it at 100 gives the percentage factor.
  const closingFraction = closingCosts(100, financingParams).total / 100;
  const price = (loan + equity) / (1 + closingFraction);
  return Math.max(0, price);
}

/**
 * Highest purchase price that still satisfies the 35 % rule.
 *
 * @param {import('../../types/finance.js').Budget} budget
 * @param {import('../../types/finance.js').FinancingParams} financingParams
 * @returns {number}
 */
export function maxAffordablePrice(budget, financingParams = {}) {
  const cap = Math.max(0, Math.min(budget.headroom, budget.disposable));
  return priceForMonthlyRate(cap, financingParams);
}

/**
 * The two price thresholds that separate affordable / stretch / out of reach.
 *
 * Because the monthly rate is strictly monotonic in purchase price, the verdict for a
 * listing depends on nothing but its price. That is what lets the listings filter run as
 * a plain indexed price range in SQL instead of simulating every row, and it is why the
 * filter, the verdict chips and the detail card can never disagree - they all read these
 * same two numbers.
 *
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @param {import('../../types/finance.js').FinancingParams} [financingParams] Defaults to `profile.financing`.
 * @returns {{affordableMaxPrice: number, stretchMaxPrice: number, purchasePriceThreshold: number}|null} `null` when the profile is incomplete.
 */
export function priceThresholds(profile, financingParams) {
  if (!isProfileComplete(profile)) {
    return null;
  }
  const params = financingParams || profile.financing || {};
  const budget = computeBudget(profile);

  const affordableRate = Math.max(0, Math.min(budget.headroom, budget.disposable));
  const stretchRate = Math.max(0, Math.min(budget.stretchHeadroom, budget.disposable));

  return {
    affordableMaxPrice: priceForMonthlyRate(affordableRate, params),
    stretchMaxPrice: priceForMonthlyRate(stretchRate, params),
    purchasePriceThreshold: Math.max(0, num(params.purchasePriceThreshold, DEFAULT_PURCHASE_PRICE_THRESHOLD)),
  };
}

/**
 * Whether the user has entered enough financial data for the calculator to mean anything.
 *
 * This is the single gate for every conditional surface: the listings filter, the verdict
 * chips and the financing card on the detail page all appear or stay hidden together.
 *
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @returns {boolean}
 */
export function isProfileComplete(profile) {
  if (profile == null || typeof profile !== 'object') {
    return false;
  }
  if (netIncomeOf(profile) <= 0) {
    return false;
  }
  // Living costs must be entered deliberately - a missing value is not the same as zero,
  // and `Number(null)` is 0, so null has to be rejected explicitly.
  if (profile.livingCosts == null || !Number.isFinite(Number(profile.livingCosts))) {
    return false;
  }
  const financing = profile.financing;
  if (financing == null || typeof financing !== 'object') {
    return false;
  }
  // Zero equity is a valid answer; an unanswered field is not.
  if (financing.equity == null || !Number.isFinite(Number(financing.equity))) {
    return false;
  }
  if (
    financing.bundesland == null ||
    (!(financing.bundesland in GRUNDERWERBSTEUER) && !Number.isFinite(Number(financing.grunderwerbsteuerPct)))
  ) {
    return false;
  }
  const scenarios = financing.scenarios;
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return false;
  }
  return scenarios.some((scenario) => num(scenario?.annualRate) > 0 || num(scenario?.tilgung) > 0);
}

/**
 * Amortize the household's existing consumer debt on its own terms.
 *
 * Kept separate from the mortgage because it runs at a different rate and clears at a
 * different time - and when it clears, its instalment becomes available for the mortgage.
 *
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @returns {import('../../types/finance.js').AmortizationSchedule|null} `null` when there is no debt.
 */
export function existingDebtSchedule(profile = {}) {
  const debt = Math.max(0, num(profile.existingDebt));
  const monthlyPayment = Math.max(0, num(profile.existingDebtRate));
  if (debt <= 0 || monthlyPayment <= 0) {
    return null;
  }
  return buildSchedule({
    principal: debt,
    annualRate: num(profile.existingDebtInterest),
    monthlyPayment,
  });
}

/**
 * The age each person reaches when the mortgage is cleared - the issue's milestone age.
 *
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @param {number|null} payoffMonths
 * @param {number} [now] Epoch ms, injectable for tests.
 * @returns {Array<{label: string, age: number, ageWhenDebtFree: number|null, payoffDate: number|null}>}
 */
export function debtFreeAges(profile = {}, payoffMonths = null, now = Date.now()) {
  const years = payoffMonths == null ? null : Math.ceil(num(payoffMonths) / 12);
  const payoffDate = payoffMonths == null ? null : new Date(now).setMonth(new Date(now).getMonth() + payoffMonths);

  return activePersons(profile).map((person, index) => {
    const age = num(person?.age);
    return {
      label: person?.label || (index === 0 ? 'A' : 'B'),
      age,
      ageWhenDebtFree: years == null ? null : age + years,
      payoffDate,
    };
  });
}

/**
 * Score a single listing against the household's finances.
 *
 * @param {{id?: string, price?: number, title?: string, address?: string}} listing
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @param {import('../../types/finance.js').FinancingParams} [financingParams]
 * @returns {import('../../types/finance.js').ListingAffordability|null} `null` when the listing has no usable price.
 */
export function scoreListing(listing, profile, financingParams) {
  const price = num(listing?.price, NaN);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }
  const params = { ...(financingParams || profile?.financing || {}), purchasePrice: price };
  const budget = computeBudget(profile);
  const result = calculateFinancing(params);
  const primary = result.primary;

  /*
   * Comparing listings means holding the instalment still and letting the term move. Fix the
   * Tilgung as a percentage instead and every listing comes out at the same number of years,
   * because the term of an annuity follows from the Sollzins and the Tilgung and not from how
   * much is borrowed. So the per-listing term is quoted at the instalment the scenario sets,
   * falling back to the most the 35 % rule allows when the scenario only carries a Tilgung.
   */
  const scenarioRate = Math.max(0, num(params?.scenarios?.[0]?.monthlyPayment));
  const affordableRate = scenarioRate > 0 ? scenarioRate : Math.max(0, Math.min(budget.headroom, budget.disposable));
  const atBudget =
    affordableRate > 0 && result.loanAmount > 0
      ? buildSchedule({
          principal: result.loanAmount,
          annualRate: primary.annualRate,
          monthlyPayment: affordableRate,
          fixedYears: primary.fixedYears,
        })
      : null;

  return {
    // Term when paying the affordable rate rather than the scenario's annuity. Null when the
    // household has no spare money at all, or when that rate never covers the interest.
    payoffMonthsAtBudget: atBudget?.payoffMonths ?? (result.loanAmount <= 0 ? 0 : null),
    payoffYearsAtBudget: monthsToYears(atBudget?.payoffMonths ?? (result.loanAmount <= 0 ? 0 : null)),
    affordableRate,
    id: listing?.id ?? null,
    title: listing?.title ?? null,
    address: listing?.address ?? null,
    price,
    loanAmount: result.loanAmount,
    closingCosts: result.closingCosts.total,
    monthlyPayment: primary.monthlyPayment,
    payoffMonths: primary.payoffMonths,
    payoffYears: monthsToYears(primary.payoffMonths),
    totalInterest: primary.totalInterest,
    restschuld: primary.restschuld,
    neverPaysOff: primary.neverPaysOff,
    rateShareOfNetIncome:
      budget.netIncome > 0 ? (primary.monthlyPayment + budget.existingDebtRate) / budget.netIncome : null,
    verdict: classify(primary.monthlyPayment, budget),
  };
}

/**
 * Verdict for a price using only the precomputed thresholds - the cheap path used for
 * the per-row chips in the listings overview.
 *
 * @param {number} price
 * @param {{affordableMaxPrice: number, stretchMaxPrice: number, purchasePriceThreshold: number}|null} thresholds
 * @returns {'affordable'|'stretch'|'unaffordable'|null} `null` when the price is below the rental threshold.
 */
export function verdictForPrice(price, thresholds) {
  const value = num(price, NaN);
  if (thresholds == null || !Number.isFinite(value) || value < thresholds.purchasePriceThreshold) {
    return null;
  }
  if (value <= thresholds.affordableMaxPrice) {
    return 'affordable';
  }
  if (value <= thresholds.stretchMaxPrice) {
    return 'stretch';
  }
  return 'unaffordable';
}

/*
 * ---------------------------------------------------------------------------------------------
 * Renting
 *
 * A rental needs no loan, no closing costs and no amortization: its monthly rate is simply the
 * rent, warm. That means the whole rent side is the budget machinery above, entered from the
 * other end - which is why it lives here rather than in a parallel module, and why a rent and a
 * purchase verdict can never be measured by different yardsticks.
 * ---------------------------------------------------------------------------------------------
 */

/**
 * The Nebenkosten surcharge that turns a quoted cold rent into what the household actually pays.
 *
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @returns {number} Percent.
 */
function nebenkostenPctOf(profile) {
  const stored = profile?.renting?.nebenkostenPct;
  // "Not given" has to be distinguished from "given as zero" before the value is coerced:
  // Number(null) and Number('') are both 0 and both finite, so a plain num(stored, DEFAULT)
  // would read a field the user never filled in as a 0 % surcharge and quietly judge every
  // rental on its cold rent alone.
  if (stored == null || stored === '') {
    return DEFAULT_NEBENKOSTEN_PCT;
  }
  return Math.max(0, num(stored, DEFAULT_NEBENKOSTEN_PCT));
}

/**
 * Warm rent for a quoted cold rent.
 *
 * @param {number} coldRent
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @returns {number}
 */
export function warmRent(coldRent, profile) {
  return Math.max(0, num(coldRent)) * (1 + nebenkostenPctOf(profile) / 100);
}

/**
 * Whether the user has entered enough for the rent half to mean anything.
 *
 * Renting needs no equity, no Bundesland and no interest scenarios, so this is a lower bar than
 * {@link isProfileComplete}: someone who only ever rents can fill in three fields and get
 * verdicts, without being asked about Grunderwerbsteuer.
 *
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @returns {boolean}
 */
export function isRentProfileComplete(profile) {
  if (profile == null || typeof profile !== 'object') {
    return false;
  }
  // The renting block has to be present, not merely defaultable. It is what the user's "Save"
  // on the renting tab writes and what "Delete" removes, so its presence is the single signal
  // that the household actually set renting up - without it, deleting renting would leave the
  // rent verdicts on, since income and living costs alone would still satisfy the rule below.
  if (profile.renting == null || typeof profile.renting !== 'object') {
    return false;
  }
  if (netIncomeOf(profile) <= 0) {
    return false;
  }
  // Same reasoning as on the purchase side: a missing value is not the same as zero.
  return profile.livingCosts != null && Number.isFinite(Number(profile.livingCosts));
}

/**
 * The two cold-rent ceilings that separate affordable / stretch / out of reach.
 *
 * The ceilings are computed on warm rent - that is what the budget actually sees - and then
 * converted back to cold rent, because cold rent is what a listing quotes.
 *
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @returns {{affordableMaxRent: number, stretchMaxRent: number, warmAffordable: number, warmStretch: number, nebenkostenPct: number}|null} `null` when the rent half is incomplete.
 */
export function rentThresholds(profile) {
  if (!isRentProfileComplete(profile)) {
    return null;
  }
  const budget = computeBudget(profile);
  const nebenkostenPct = nebenkostenPctOf(profile);
  const toCold = (warm) => warm / (1 + nebenkostenPct / 100);

  const warmAffordable = Math.max(0, Math.min(budget.headroom, budget.disposable));
  const warmStretch = Math.max(0, Math.min(budget.stretchHeadroom, budget.disposable));

  return {
    affordableMaxRent: toCold(warmAffordable),
    stretchMaxRent: toCold(warmStretch),
    warmAffordable,
    warmStretch,
    nebenkostenPct,
  };
}

/**
 * Verdict for a quoted cold rent using only the precomputed thresholds.
 *
 * @param {number} price Cold rent as the provider quoted it.
 * @param {{affordableMaxRent: number, stretchMaxRent: number}|null} thresholds
 * @returns {'affordable'|'stretch'|'unaffordable'|null} `null` when there is nothing to judge.
 */
export function verdictForRent(price, thresholds) {
  const value = num(price, NaN);
  if (thresholds == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value <= thresholds.affordableMaxRent) {
    return 'affordable';
  }
  if (value <= thresholds.stretchMaxRent) {
    return 'stretch';
  }
  return 'unaffordable';
}

/**
 * Score a single rental against the household's finances - the rent twin of {@link scoreListing}.
 *
 * @param {{id?: string, price?: number, title?: string, address?: string}} listing
 * @param {import('../../types/finance.js').FinanceProfile} profile
 * @returns {import('../../types/finance.js').RentAffordability|null} `null` when the listing has no usable price.
 */
export function scoreRentListing(listing, profile) {
  const coldRent = num(listing?.price, NaN);
  if (!Number.isFinite(coldRent) || coldRent <= 0) {
    return null;
  }
  const budget = computeBudget(profile);
  const warm = warmRent(coldRent, profile);

  return {
    id: listing?.id ?? null,
    title: listing?.title ?? null,
    address: listing?.address ?? null,
    dealType: DEAL_TYPES.RENT,
    price: coldRent,
    coldRent,
    warmRent: warm,
    nebenkosten: warm - coldRent,
    nebenkostenPct: nebenkostenPctOf(profile),
    monthlyPayment: warm,
    remainingAfterRent: budget.disposable - warm,
    rateShareOfNetIncome: budget.netIncome > 0 ? (warm + budget.existingDebtRate) / budget.netIncome : null,
    // The same classifier the purchase side uses, fed the warm rent instead of an instalment.
    verdict: classify(warm, budget),
  };
}

/**
 * Both halves of the user's thresholds in one object - what every consumer needs to judge a
 * listing without knowing in advance whether it is a rental or a purchase.
 *
 * @param {import('../../types/finance.js').FinanceProfile|null} profile
 * @returns {{buy: ReturnType<typeof priceThresholds>, rent: ReturnType<typeof rentThresholds>}}
 */
export function thresholdsFor(profile) {
  // Both helpers gate on their own completeness check, so there is nothing to pre-check here.
  return {
    buy: priceThresholds(profile, profile?.financing),
    rent: rentThresholds(profile),
  };
}

/**
 * Verdict for a listing, picking the yardstick from the deal type of the job that found it.
 *
 * The single entry point for the chips, the detail page and anything else that has a price and
 * a deal type but no appetite for knowing which formula applies.
 *
 * @param {number} price
 * @param {'rent'|'buy'|null|undefined} dealType
 * @param {{buy: Object|null, rent: Object|null}|null} thresholds From {@link thresholdsFor}.
 * @returns {'affordable'|'stretch'|'unaffordable'|null} `null` when that half of the profile is missing.
 */
export function verdictForListing(price, dealType, thresholds) {
  if (thresholds == null) {
    return null;
  }
  return dealType === DEAL_TYPES.RENT ? verdictForRent(price, thresholds.rent) : verdictForPrice(price, thresholds.buy);
}
