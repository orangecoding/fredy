/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getProviders } from '../../utils.js';
import { getJobs } from '../storage/jobStorage.js';
import { canAccessJob } from '../security/access.js';
import { countriesForListing, DEFAULT_COUNTRIES, normalizeCountries, unionCountries } from './countries.js';

/**
 * Resolving "which countries is this geocode about?" from whatever the caller has in hand.
 *
 * Four rules, most specific first. A geocode with a *listing* behind it lets the provider narrow
 * the answer to that one listing's country, which is the only way a provider covering several
 * markets can be asked about one flat. One with only a provider behind it uses that provider's
 * declaration. One coming from the job form uses the providers ticked in the form. Everything else
 * - home addresses, the listings map, the listing detail - has no provider at all, and falls back
 * to the union across the user's jobs.
 */

/**
 * `metaInformation` of every loaded provider, by id.
 *
 * @returns {Promise<Map<string, Object>>}
 */
async function metaById() {
  const providers = await getProviders();
  const map = new Map();
  for (const provider of providers ?? []) {
    const meta = provider?.metaInformation;
    if (typeof meta?.id === 'string' && meta.id.length > 0) {
      map.set(meta.id, meta);
    }
  }
  return map;
}

/**
 * The countries one provider serves.
 *
 * An id that matches no loaded provider answers with the default rather than nothing: the callers
 * are stored listings, and a listing may outlive the provider module that found it.
 *
 * The whole of what the provider serves, which for a provider covering several markets is wider
 * than any one of its listings. A caller holding a listing wants {@link getCountriesForListing}.
 *
 * @param {string|null|undefined} providerId
 * @returns {Promise<string[]>}
 */
export async function getCountriesForProvider(providerId) {
  const meta = (await metaById()).get(providerId);
  return normalizeCountries(meta?.countries);
}

/**
 * The countries one listing could be in.
 *
 * The same question as {@link getCountriesForProvider} asked about a single row, and the answer
 * differs only for a provider that covers several markets and can tell them apart - see
 * `countriesForListing` in `countries.js` for why that matters and what a provider may narrow to.
 * Every caller that holds a listing should ask this one: a geocode, a coverage lookup and the cache
 * scope that pairs with them are all about one address, never about a provider's whole reach.
 *
 * @param {string|null|undefined} providerId The provider the listing was found by. Kept separate
 *   from the listing because the pipeline knows it before a listing has one stored on it.
 * @param {any} listing The listing being placed.
 * @returns {Promise<string[]>}
 */
export async function getCountriesForListing(providerId, listing) {
  return countriesForListing((await metaById()).get(providerId), listing);
}

/**
 * The countries several providers serve between them.
 *
 * @param {string[]|null|undefined} providerIds
 * @returns {Promise<string[]>}
 */
export async function getCountriesForProviderIds(providerIds) {
  if (!Array.isArray(providerIds) || providerIds.length === 0) {
    return [...DEFAULT_COUNTRIES];
  }

  const map = await metaById();
  const lists = [];
  for (const id of providerIds) {
    const meta = map.get(id);
    // An unknown id contributes nothing. Answering with the default for it would let one stale id
    // in a query parameter drag Germany into a union that has nothing to do with it.
    if (meta != null) {
      lists.push(normalizeCountries(meta.countries));
    }
  }
  return unionCountries(lists);
}

/**
 * The countries in scope for a user, with no provider in hand.
 *
 * Home addresses have no provider behind them, and neither do the listings map or the listing
 * detail map. For those, "where does this user search?" is the closest available answer: the union
 * over every provider configured across the jobs they can see. Same job set as `GET /api/jobs`,
 * so the maps and the geocoder cannot disagree about it.
 *
 * @param {string|null|undefined} userId
 * @returns {Promise<string[]>}
 */
export async function getCountriesForUser(userId) {
  if (userId == null) {
    return [...DEFAULT_COUNTRIES];
  }

  const user = { id: userId };
  const providerIds = new Set();
  for (const job of getJobs({ includeDisabled: true })) {
    if (!canAccessJob(user, job)) continue;
    for (const entry of job.provider ?? []) {
      if (typeof entry?.id === 'string' && entry.id.length > 0) {
        providerIds.add(entry.id);
      }
    }
  }

  return getCountriesForProviderIds([...providerIds]);
}

/**
 * Every provider serving at least one of these countries.
 *
 * Only the geocode cache needs this. That cache matches stored coordinates by address text alone,
 * and a street name that exists in two countries would otherwise hand back the wrong one; scoping
 * the lookup to the providers of the countries being asked about is what stops it.
 *
 * @param {string[]|null|undefined} countries
 * @returns {Promise<string[]>} Provider ids.
 */
export async function getProviderIdsForCountries(countries) {
  const wanted = new Set(normalizeCountries(countries));
  const ids = [];
  for (const [id, meta] of await metaById()) {
    if (normalizeCountries(meta.countries).some((code) => wanted.has(code))) {
      ids.push(id);
    }
  }
  return ids;
}
