/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useMemo } from 'react';
import { useSelector } from '../services/state/store.js';
import { DEFAULT_COUNTRIES } from '../components/map/countryBounds.js';

/**
 * Which countries the maps should cover.
 *
 * Costs no request. `/api/jobs/provider` answers with each provider's `metaInformation` verbatim, so
 * the optional `countries` declaration arrives in the store's `provider` slice on its own, and both
 * that slice and the user's jobs are loaded at boot in `App.jsx`.
 */

/**
 * Fold a set of provider ids into the countries they serve between them.
 *
 * @param {Array<{id: string, countries?: string[]}>} providers - The `provider` store slice.
 * @param {Iterable<string>} providerIds - Ids to resolve.
 * @returns {string[]} Sorted alpha-2 codes, falling back to the default when nothing resolves.
 */
function countriesOf(providers, providerIds) {
  const byId = new Map((providers ?? []).map((provider) => [provider?.id, provider]));
  const codes = new Set();

  for (const id of providerIds) {
    // An id matching no provider contributes nothing: it is a job pointing at a provider that has
    // since been removed. One that matches but declares nothing means Germany, the same rule the
    // server applies.
    if (!byId.has(id)) continue;
    const declared = byId.get(id)?.countries;
    for (const code of Array.isArray(declared) && declared.length > 0 ? declared : DEFAULT_COUNTRIES) {
      if (typeof code === 'string') {
        codes.add(code.toLowerCase());
      }
    }
  }

  return codes.size === 0 ? [...DEFAULT_COUNTRIES] : [...codes].sort();
}

/**
 * The countries served by a given set of providers.
 *
 * For the job form, which knows exactly which providers are ticked right now.
 *
 * @param {Array<{id: string}>} [providerData] - The job's configured providers, `{id, url}` each.
 * @returns {string[]} Alpha-2 codes.
 */
export function useCountriesForProviders(providerData) {
  const providers = useSelector((state) => state.provider);
  const ids = (providerData ?? []).map((entry) => entry?.id).filter((id) => typeof id === 'string');
  // Joined rather than passed as an array, so a re-render handing over an equal-but-new array does
  // not produce a new result and, through it, a needless `setMaxBounds` on the live map.
  const key = ids.join(',');

  return useMemo(() => countriesOf(providers, key.length > 0 ? key.split(',') : []), [providers, key]);
}

/**
 * The countries in scope for the whole account.
 *
 * For the maps with no provider in hand - the listings map and the listing detail - where the
 * closest available answer to "where does this user search?" is the union over every provider
 * configured across their jobs. Same rule the server applies to home addresses.
 *
 * @returns {string[]} Alpha-2 codes.
 */
export function useProviderCountries() {
  const providers = useSelector((state) => state.provider);
  const jobs = useSelector((state) => state.jobsData.jobs);

  return useMemo(() => {
    const ids = new Set();
    for (const job of jobs ?? []) {
      for (const entry of job?.provider ?? []) {
        if (typeof entry?.id === 'string') {
          ids.add(entry.id);
        }
      }
    }
    return countriesOf(providers, ids);
  }, [providers, jobs]);
}
