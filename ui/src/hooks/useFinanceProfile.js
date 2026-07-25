/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useSelector } from '../services/state/store.js';
import {
  isProfileComplete,
  isRentProfileComplete,
  thresholdsFor,
} from '../../../lib/services/finance/affordability.js';
import { normalizeProfile } from '../../../lib/services/finance/profile.js';

/**
 * One derivation shared by every caller, keyed on the identity of the stored profile.
 *
 * A `useMemo` would be per component instance, and the listings overview mounts one
 * {@link import('../components/listings/AffordabilityChip.jsx')} per row - fifty rows would
 * normalize the profile and recompute both threshold sets fifty times for one identical answer.
 * The stored profile is replaced wholesale on every write, so reference equality is an exact
 * cache key.
 *
 * @type {{key: Object|null, value: Object}|null}
 */
let cache = null;

/**
 * @param {Object|null} stored
 * @returns {Object} The derived profile view described by {@link useFinanceProfile}.
 */
function deriveProfile(stored) {
  if (cache != null && cache.key === stored) {
    return cache.value;
  }
  // Completeness is judged on what was actually saved. Normalizing first would fill in
  // defaults and make an untouched profile look configured.
  const isComplete = isProfileComplete(stored);
  const rentComplete = isRentProfileComplete(stored);
  const value = {
    profile: normalizeProfile(stored),
    stored,
    isComplete,
    rentComplete,
    anyComplete: isComplete || rentComplete,
    // Derived from the stored profile for the same reason; the Nebenkosten default is applied
    // inside rentThresholds, so an unsaved profile still yields sensible ceilings.
    thresholds: thresholdsFor(stored),
  };
  cache = { key: stored, value };
  return value;
}

/**
 * The user's saved finance profile, and whether each half of it is complete enough to act on.
 *
 * Every conditional finance surface reads this one hook - the affordability filter on the
 * listings overview, the verdict chips, and the financing card on the detail page - so
 * "has the user entered their financial data?" has exactly one answer across the UI.
 *
 * The two halves are independent: someone who only ever rents fills in income and living costs
 * and gets rent verdicts, without ever being asked about equity or Grunderwerbsteuer.
 *
 * @returns {{
 *   profile: import('../../../lib/types/finance.js').FinanceProfile,
 *   stored: Object|null,
 *   isComplete: boolean,
 *   rentComplete: boolean,
 *   anyComplete: boolean,
 *   thresholds: {
 *     buy: {affordableMaxPrice: number, stretchMaxPrice: number, purchasePriceThreshold: number}|null,
 *     rent: import('../../../lib/types/finance.js').RentThresholds|null
 *   }
 * }}
 */
export function useFinanceProfile() {
  const stored = useSelector((state) => state.userSettings.settings.finance_profile) ?? null;
  return deriveProfile(stored);
}
