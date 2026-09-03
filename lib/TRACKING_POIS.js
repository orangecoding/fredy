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
  LISTING_ADDRESS_MANUAL: 'LISTING_ADDRESS_MANUAL',
  CHANGE_LANGUAGE: 'CHANGE_LANGUAGE',
  CHANGE_THEME_DARK: 'CHANGE_THEME_DARK',
  CHANGE_THEME_LIGHT: 'CHANGE_THEME_LIGHT',
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
  /*
   * Asking for support only earns its place in the sidebar if it leads anywhere, and the two
   * halves of that question are separate: how many people open the dialog at all, and how many
   * of those actually leave for one of the three platforms. Opening is counted on its own for
   * that reason - without it a low number of clicks says nothing about whether the dialog is
   * ignored or merely never found. The platforms are counted apart because they are not
   * interchangeable: a one-off tip and a recurring sponsorship are different decisions.
   */
  DONATION_MODAL_OPENED: 'DONATION_MODAL_OPENED',
  DONATION_GITHUB_CLICKED: 'DONATION_GITHUB_CLICKED',
  DONATION_KOFI_CLICKED: 'DONATION_KOFI_CLICKED',
  DONATION_PAYPAL_CLICKED: 'DONATION_PAYPAL_CLICKED',
  /*
   * Price tracking, switched on and off. Both halves are counted because only the pair answers the
   * question worth asking: a feature that is turned on widely and quietly turned off again a week
   * later looks identical to a popular one if you only ever count the switching on.
   *
   * Counted on the transition, not on the presence of the field - the Execution page sends the
   * whole form on every save, so firing whenever the value arrives would report how often that page
   * was saved rather than how often anyone changed their mind about the feature.
   */
  FEATURE_TRACKING_ENABLED: 'FEATURE_TRACKING_ENABLED',
  FEATURE_TRACKING_DISABLED: 'FEATURE_TRACKING_DISABLED',
  /*
   * Broadband and mobile coverage on a listing, switched on and off. Counted as a pair and on the
   * transition for the same reason price tracking is: the settings page posts all of its fields on
   * every save, so counting the value's presence would report how often that page was saved.
   */
  CONNECTIVITY_ENABLED: 'CONNECTIVITY_ENABLED',
  CONNECTIVITY_DISABLED: 'CONNECTIVITY_DISABLED',
  /*
   * One of the national registers switched off while the feature stays on. Kept apart from the
   * pair above because it is a different verdict: turning the feature off says "I don't need
   * this", turning a single register off says "that one is not worth asking".
   */
  CONNECTIVITY_SOURCE_DISABLED: 'CONNECTIVITY_SOURCE_DISABLED',
  /*
   * The three connectivity filters on the listings overview, counted when each is switched on.
   *
   * Separately, because they are three different questions and a combined counter would hide the
   * answer: somebody filtering for fibre is deciding where to live for the next five years, and
   * somebody filtering for 5G is deciding whether their phone will work in the kitchen.
   */
  CONNECTIVITY_FILTER_DOWNSTREAM: 'CONNECTIVITY_FILTER_DOWNSTREAM',
  CONNECTIVITY_FILTER_FIBER: 'CONNECTIVITY_FILTER_FIBER',
  CONNECTIVITY_FILTER_MOBILE: 'CONNECTIVITY_FILTER_MOBILE',
  /*
   * A register stopped answering for a whole sweep. These are other people's services, published
   * on their own terms, and this is the only way to find out one has gone away before users start
   * reporting empty cards. Fired at most once per sweep - once per listing would drown out
   * everything else here.
   */
  CONNECTIVITY_SOURCE_UNAVAILABLE: 'CONNECTIVITY_SOURCE_UNAVAILABLE',
  LAGECHECK_OPENED: 'LAGECHECK_OPENED',
};
