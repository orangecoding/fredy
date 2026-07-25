/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

export const TRACKING_POIS = {
  DISTANCE_ADDRESS_ENTERED: 'DISTANCE_ADDRESS_ENTERED',
  WELCOME_FINISHED: 'WELCOME_FINISHED',
  WELCOME_SKIPPED: 'WELCOME_SKIPPED',
  JOBS_TABLE_VIEW: 'JOBS_TABLE_VIEW',
  LISTING_TABLE_VIEW: 'LISTING_TABLE_VIEW',
  BASE_URL_SETTING: 'BASE_URL_SETTING',
  SET_PROXY_SETTING: 'SET_PROXY_SETTING',
  DETECTED_AS_BOT: 'DETECTED_AS_BOT',
  NOTES_CREATE: 'NOTES_CREATE',
  USING_LISTING_STATUS: 'USING_LISTING_STATUS',
  CHANGE_LANGUAGE: 'CHANGE_LANGUAGE',
  FINANCE_CALCULATOR_USED: 'FINANCE_CALCULATOR_USED',
  /*
   * The finance feature has two independent halves, and the interesting question is which of
   * them people actually set up: a household that only rents never fills in the buying tab, and
   * the reverse is just as common. Saving is tracked per half for that reason, and only for the
   * explicit Save button - the save-on-blur would otherwise report a number that says more about
   * how often a field was touched than about how many people use the feature.
   */
  FINANCE_RENT_PROFILE_SAVED: 'FINANCE_RENT_PROFILE_SAVED',
  FINANCE_BUY_PROFILE_SAVED: 'FINANCE_BUY_PROFILE_SAVED',
  /** Removing a half again is the clearest signal that it did not earn its place. */
  FINANCE_PROFILE_DELETED: 'FINANCE_PROFILE_DELETED',
  /** Scoring the whole database at once, as opposed to pricing up a single listing. */
  FINANCE_AFFORDABILITY_SCAN: 'FINANCE_AFFORDABILITY_SCAN',
  /** The affordability filter on the listings overview, counted when it is switched on. */
  FINANCE_AFFORDABILITY_FILTER_USED: 'FINANCE_AFFORDABILITY_FILTER_USED',
};
