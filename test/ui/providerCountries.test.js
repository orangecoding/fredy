/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Which countries the maps in the UI cover.
 *
 * Same trick as `useControllableState.test.js`: React is stubbed rather than rendered, because
 * these two hooks are a selector and a fold and pulling in a DOM renderer would test neither.
 *
 * The rule they implement has to match the server's, or a listing lands outside the box the map
 * allows and cannot be looked at: a provider that declares nothing means Germany, an id belonging to
 * no provider means nothing at all, and several providers mean the union.
 */
const store = vi.hoisted(() => ({ state: { provider: [], jobsData: { jobs: [] } } }));

vi.mock('react', () => ({ useMemo: (fn) => fn() }));
vi.mock('../../ui/src/services/state/store.js', () => ({
  useSelector: (selector) => selector(store.state),
}));

const { useProviderCountries, useCountriesForProviders } = await import('../../ui/src/hooks/useProviderCountries.js');

beforeEach(() => {
  store.state = {
    provider: [
      { id: 'immowelt', name: 'Immowelt' },
      { id: 'swissportal', name: 'Swiss Portal', countries: ['ch'] },
      { id: 'benelux', name: 'Benelux', countries: ['nl', 'be', 'lu'] },
    ],
    jobsData: { jobs: [] },
  };
});

describe('the countries of the providers picked in the job form', () => {
  it('is Germany for a provider that declares nothing', () => {
    expect(useCountriesForProviders([{ id: 'immowelt' }])).toEqual(['de']);
  });

  it('is what the provider declared otherwise', () => {
    expect(useCountriesForProviders([{ id: 'swissportal' }])).toEqual(['ch']);
  });

  it('unions several', () => {
    expect(useCountriesForProviders([{ id: 'immowelt' }, { id: 'benelux' }])).toEqual(['be', 'de', 'lu', 'nl']);
  });

  // A job can outlive a provider module. Counting it as Germany would open the map wider than the
  // job it belongs to.
  it('lets a provider that no longer exists contribute nothing', () => {
    expect(useCountriesForProviders([{ id: 'swissportal' }, { id: 'deleted' }])).toEqual(['ch']);
  });

  // The form starts empty, and the map still has to be bounded by something.
  it('is Germany before any provider has been added', () => {
    expect(useCountriesForProviders([])).toEqual(['de']);
    expect(useCountriesForProviders(undefined)).toEqual(['de']);
  });
});

describe('the countries in scope for the account', () => {
  it('unions every provider across the jobs', () => {
    store.state.jobsData.jobs = [
      { id: 'j1', provider: [{ id: 'immowelt' }] },
      { id: 'j2', provider: [{ id: 'swissportal' }] },
    ];

    expect(useProviderCountries()).toEqual(['ch', 'de']);
  });

  it('counts each provider once, however many jobs use it', () => {
    store.state.jobsData.jobs = [
      { id: 'j1', provider: [{ id: 'swissportal' }] },
      { id: 'j2', provider: [{ id: 'swissportal' }] },
    ];

    expect(useProviderCountries()).toEqual(['ch']);
  });

  it('is Germany for an account with no jobs yet', () => {
    expect(useProviderCountries()).toEqual(['de']);
  });

  // The slices are loaded at boot, but the first render happens before they land.
  it('is Germany while the store is still empty', () => {
    store.state = { provider: undefined, jobsData: {} };

    expect(useProviderCountries()).toEqual(['de']);
  });
});
