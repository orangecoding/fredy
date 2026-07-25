/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  DEFAULT_MAKLER_PCT,
  DEFAULT_NEBENKOSTEN_PCT,
  DEFAULT_NOTARY_PCT,
  DEFAULT_PURCHASE_PRICE_THRESHOLD,
  DEFAULT_TILGUNG,
  DEFAULT_ZINSBINDUNG_YEARS,
  num,
} from './constants.js';

/**
 * A blank profile with sensible German defaults.
 *
 * Three rate scenarios are seeded so the multi-scenario chart has something to draw on
 * first load - an empty chart is a worse first impression than a plausible one.
 *
 * @returns {import('../../types/finance.js').FinanceProfile}
 */
export function defaultProfile() {
  return {
    personA: { label: 'A', enabled: true, age: 35, primaryIncome: 0, secondaryIncome: 0 },
    personB: { label: 'B', enabled: false, age: 35, primaryIncome: 0, secondaryIncome: 0 },
    livingCosts: 0,
    existingDebt: 0,
    existingDebtRate: 0,
    existingDebtInterest: 0,
    rollFreedBudgetIntoMortgage: false,
    renting: {
      nebenkostenPct: DEFAULT_NEBENKOSTEN_PCT,
    },
    financing: {
      purchasePrice: 0,
      equity: 0,
      bundesland: 'NW',
      notaryPct: DEFAULT_NOTARY_PCT,
      maklerPct: DEFAULT_MAKLER_PCT,
      purchasePriceThreshold: DEFAULT_PURCHASE_PRICE_THRESHOLD,
      scenarios: [
        { id: 'low', label: '3.0 %', annualRate: 3.0, tilgung: DEFAULT_TILGUNG, fixedYears: DEFAULT_ZINSBINDUNG_YEARS },
        { id: 'mid', label: '3.8 %', annualRate: 3.8, tilgung: DEFAULT_TILGUNG, fixedYears: DEFAULT_ZINSBINDUNG_YEARS },
        {
          id: 'high',
          label: '4.6 %',
          annualRate: 4.6,
          tilgung: DEFAULT_TILGUNG,
          fixedYears: DEFAULT_ZINSBINDUNG_YEARS,
        },
      ],
    },
  };
}

/**
 * Merge a stored (possibly partial or outdated) profile onto the defaults.
 *
 * Profiles live in a schemaless settings row, so a profile written by an older version can
 * be missing any field. Normalizing on read keeps every consumer free of null checks.
 *
 * @param {Partial<import('../../types/finance.js').FinanceProfile>|null|undefined} stored
 * @returns {import('../../types/finance.js').FinanceProfile}
 */
export function normalizeProfile(stored) {
  const base = defaultProfile();
  if (stored == null || typeof stored !== 'object') {
    return base;
  }
  const storedFinancing = stored.financing && typeof stored.financing === 'object' ? stored.financing : {};
  const scenarios =
    Array.isArray(storedFinancing.scenarios) && storedFinancing.scenarios.length > 0
      ? storedFinancing.scenarios
      : base.financing.scenarios;

  return {
    ...base,
    ...stored,
    personA: { ...base.personA, ...(stored.personA || {}) },
    personB: { ...base.personB, ...(stored.personB || {}) },
    livingCosts: num(stored.livingCosts, base.livingCosts),
    // Profiles written before the rent half existed have no `renting` block at all.
    renting: { ...base.renting, ...(stored.renting || {}) },
    financing: {
      ...base.financing,
      ...storedFinancing,
      scenarios,
    },
  };
}
