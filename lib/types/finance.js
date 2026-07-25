/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * One income earner in the household. Person B is only counted when `enabled` is true.
 *
 * @typedef {Object} Person
 * @property {string} [label] Display name, e.g. "Me" / "Partner".
 * @property {boolean} [enabled] Whether this person counts towards the budget.
 * @property {number} age Current age in years.
 * @property {number} primaryIncome Monthly net income from the main job.
 * @property {number} secondaryIncome Monthly net income from any other source.
 */

/**
 * One interest-rate scenario to simulate. Percent values are stored as percent
 * (3.8 means 3.8 %), matching what the user types.
 *
 * @typedef {Object} RateScenario
 * @property {string} id
 * @property {string} label
 * @property {number} annualRate Nominal interest rate (Sollzins) in percent.
 * @property {number} tilgung Initial amortization (anfängliche Tilgung) in percent per year.
 * @property {number} fixedYears Fixed-rate period (Zinsbindung) in years.
 * @property {number|null} [monthlyPayment] Explicit instalment in EUR. Overrides `tilgung` when set.
 * @property {number} [sondertilgungPerYear] Extra repayment in EUR applied once a year.
 */

/**
 * Everything about the property and the loan, as opposed to the household.
 *
 * @typedef {Object} FinancingParams
 * @property {number} purchasePrice Kaufpreis in EUR.
 * @property {number} equity Eigenkapital in EUR.
 * @property {string} bundesland Two-letter code driving the Grunderwerbsteuer default.
 * @property {number} [grunderwerbsteuerPct] Explicit override in percent.
 * @property {number} [notaryPct] Notar + Grundbuch in percent.
 * @property {number} [maklerPct] Buyer's share of the agent commission in percent.
 * @property {number} [purchasePriceThreshold] Below this a listing is treated as a rental.
 * @property {RateScenario[]} scenarios
 */

/**
 * Everything about renting, as opposed to the household or a purchase.
 *
 * @typedef {Object} RentParams
 * @property {number} nebenkostenPct Surcharge on the quoted cold rent that makes it warm, in percent.
 */

/**
 * The persisted per-user profile, stored as the `finance_profile` settings key.
 *
 * The household fields apply to both halves; `renting` and `financing` each apply only to jobs of
 * the matching deal type.
 *
 * @typedef {Object} FinanceProfile
 * @property {Person} personA
 * @property {Person} [personB]
 * @property {number} livingCosts Monthly living costs excluding rent.
 * @property {number} [existingDebt] Outstanding consumer debt in EUR.
 * @property {number} [existingDebtRate] Monthly instalment on that debt.
 * @property {number} [existingDebtInterest] Interest rate on that debt in percent.
 * @property {boolean} [rollFreedBudgetIntoMortgage] Redirect the consumer-debt instalment into the mortgage once it clears.
 * @property {RentParams} [renting]
 * @property {FinancingParams} financing
 */

/**
 * @typedef {Object} ScheduleMonth
 * @property {number} month 1-based month index.
 * @property {number} interest Interest paid this month.
 * @property {number} principal Principal repaid this month, including any Sondertilgung.
 * @property {number} payment Total paid this month.
 * @property {number} balance Remaining debt after this month.
 */

/**
 * @typedef {Object} AmortizationSchedule
 * @property {number} monthlyPayment The regular instalment.
 * @property {ScheduleMonth[]} months
 * @property {number|null} payoffMonths Months until the debt is cleared; `null` if it never is.
 * @property {number} totalInterest
 * @property {number} totalPaid
 * @property {number|null} restschuld Remaining debt at the end of the Zinsbindung.
 * @property {number|null} restschuldAtMonth
 * @property {boolean} neverPaysOff True when the instalment does not cover the interest.
 */

/**
 * @typedef {Object} ClosingCosts
 * @property {number} grunderwerbsteuer
 * @property {number} notar
 * @property {number} makler
 * @property {number} total
 * @property {number} totalPct Combined rate in percent.
 */

/**
 * @typedef {Object} FinancingResult
 * @property {number} purchasePrice
 * @property {number} equity
 * @property {ClosingCosts} closingCosts
 * @property {number} totalCost Purchase price plus Kaufnebenkosten.
 * @property {number} loanAmount
 * @property {number} equityRatio Share of the total cost covered from own funds.
 * @property {Array<RateScenario & {schedule: AmortizationSchedule, monthlyPayment: number, payoffMonths: number|null, totalInterest: number, restschuld: number|null, neverPaysOff: boolean}>} scenarios
 * @property {Object} primary The first scenario, used wherever a single answer is needed.
 */

/**
 * @typedef {Object} Budget
 * @property {number} netIncome Combined monthly net income.
 * @property {number} livingCosts
 * @property {number} existingDebtRate
 * @property {number} disposable What is left after living costs and existing debt.
 * @property {number} ruleCap 35 % of net income.
 * @property {number} stretchCap 40 % of net income.
 * @property {number} headroom `ruleCap` minus existing debt service.
 * @property {number} stretchHeadroom `stretchCap` minus existing debt service.
 */

/**
 * @typedef {Object} ListingAffordability
 * @property {string|null} id
 * @property {string|null} title
 * @property {string|null} address
 * @property {number} price
 * @property {number} loanAmount
 * @property {number} closingCosts
 * @property {number} monthlyPayment
 * @property {number|null} payoffMonths
 * @property {number|null} payoffYears
 * @property {number} totalInterest
 * @property {number|null} restschuld
 * @property {boolean} neverPaysOff
 * @property {number|null} rateShareOfNetIncome
 * @property {'affordable'|'stretch'|'unaffordable'} verdict
 */

/**
 * The cold-rent ceilings a household's budget allows.
 *
 * @typedef {Object} RentThresholds
 * @property {number} affordableMaxRent Highest cold rent still inside the 35 % rule.
 * @property {number} stretchMaxRent Highest cold rent still inside the 40 % stretch bound.
 * @property {number} warmAffordable The same ceiling expressed as warm rent.
 * @property {number} warmStretch
 * @property {number} nebenkostenPct The surcharge used to convert between the two.
 */

/**
 * A rental scored against the household budget - the rent counterpart of ListingAffordability.
 *
 * @typedef {Object} RentAffordability
 * @property {string|null} id
 * @property {string|null} title
 * @property {string|null} address
 * @property {'rent'} dealType
 * @property {number} price Cold rent as quoted by the provider.
 * @property {number} coldRent
 * @property {number} warmRent
 * @property {number} nebenkosten
 * @property {number} nebenkostenPct The surcharge used, in percent.
 * @property {number} monthlyPayment What actually leaves the account each month, i.e. the warm rent.
 * @property {number} remainingAfterRent Disposable income left once the warm rent is paid.
 * @property {number|null} rateShareOfNetIncome
 * @property {'affordable'|'stretch'|'unaffordable'} verdict
 */

export {};
