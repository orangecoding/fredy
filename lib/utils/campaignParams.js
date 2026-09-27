/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The query parameters a url picks up on its way to the user that have nothing to do with the search
 * it describes: ad-click ids, analytics campaign tags, mail-campaign markers.
 *
 * Every search translator refuses a parameter it does not know, because a filter dropped in silence
 * widens the search the user saved. That refusal has to leave these alone - a url copied out of an
 * alert mail or reached through an ad carries them, and stopping the job over one tells the user a
 * filter is broken when nothing about their search is. Which tags those are is not knowledge about
 * any one portal, so it is kept here once rather than in a list per translator that each cover a
 * different half of them.
 *
 * `xtor` and the `at_` family are AT Internet's (now Piano's), which the French portals tag their
 * alert mails and partner links with.
 */

/** Tags known by their full name, lowercase. */
const CAMPAIGN_PARAMS = new Set([
  'gclid',
  'gbraid',
  'wbraid',
  'dclid',
  'gad',
  'gad_source',
  'fbclid',
  'msclkid',
  'igshid',
  'ttclid',
  'twclid',
  'yclid',
  'mc_cid',
  'mc_eid',
  'xtor',
  '_ga',
  '_gl',
]);

/** Tags known by their prefix, lowercase: UTM, AT Internet, Matomo/Piwik. */
const CAMPAIGN_PREFIXES = ['utm_', 'at_', 'mtm_', 'pk_'];

/**
 * Whether a query parameter is a campaign tag rather than part of a search.
 *
 * @param {string} name the parameter's name as the url spells it
 * @returns {boolean}
 */
export function isCampaignParam(name) {
  const lower = String(name ?? '').toLowerCase();
  return CAMPAIGN_PARAMS.has(lower) || CAMPAIGN_PREFIXES.some((prefix) => lower.startsWith(prefix));
}
