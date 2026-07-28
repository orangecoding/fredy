/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useSelector } from '../services/state/store.js';

/**
 * The derived view of the user's saved finance profile: which halves are usable, and the ceilings
 * they produce.
 *
 * Every conditional finance surface reads this one hook - the affordability filter on the listings
 * overview, the verdict chips, the financing card on the detail page - so "has the user entered
 * their financial data?" has exactly one answer across the UI.
 *
 * The numbers come from `GET /api/finance/profile-summary` rather than being computed here. The
 * browser used to run the finance modules itself, which meant the same arithmetic existed twice:
 * once scoring listings on the server for the affordability filter, once deriving the chip beside
 * them in the client. Any drift between the two showed up as a listing whose chip contradicted the
 * filter that found it.
 *
 * The summary is loaded once by the store and refreshed whenever the profile is written, so
 * reading it costs nothing per component - which matters, because the listings overview mounts one
 * chip per row.
 *
 * @returns {{
 *   isComplete: boolean,
 *   rentComplete: boolean,
 *   anyComplete: boolean,
 *   loaded: boolean,
 *   stored: Object|null,
 *   profile: import('../types/finance.js').FinanceProfile|null,
 *   budget: Object|null,
 *   thresholds: {
 *     buy: {affordableMaxPrice: number, stretchMaxPrice: number, purchasePriceThreshold: number}|null,
 *     rent: import('../types/finance.js').RentThresholds|null
 *   }
 * }}
 */
export function useFinanceProfile() {
  const summary = useSelector((state) => state.finance.summary);
  const stored = useSelector((state) => state.userSettings.settings.finance_profile) ?? null;

  return {
    isComplete: summary?.isComplete === true,
    rentComplete: summary?.rentComplete === true,
    anyComplete: summary?.anyComplete === true,
    // Lets a caller tell "no profile" apart from "not asked yet", so nothing flashes an empty
    // state while the summary is still in flight.
    loaded: summary != null,
    stored,
    // Normalized server-side, because filling in the defaults is itself a rule.
    profile: summary?.profile ?? null,
    budget: summary?.budget ?? null,
    thresholds: summary?.thresholds ?? { buy: null, rent: null },
  };
}
