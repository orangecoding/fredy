/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeCountries, unionCountries, DEFAULT_COUNTRIES } from '../../lib/services/providers/countries.js';

/**
 * Resolving which countries a geocode is about.
 *
 * The whole design rests on the default: `countries` is optional on `metaInformation`, absent means
 * Germany, and that is why not one provider file had to change and no existing installation moved.
 * Every case below is either that default holding, or something explicitly overriding it.
 */
const root = (await import('node:path')).resolve('.');
const modulePath = root + '/lib/services/providers/providerCountries.js';

/**
 * @param {string} id
 * @param {string[]} [countries]
 * @returns {Object}
 */
const provider = (id, countries) => ({ metaInformation: countries == null ? { id } : { id, countries } });

/** @type {any} */
let providers;
/** @type {any[]} */
let jobs;
/** @type {any} */
let module_;

beforeEach(async () => {
  vi.resetModules();
  providers = [provider('immowelt'), provider('swissportal', ['ch']), provider('benelux', ['nl', 'be', 'lu'])];
  jobs = [];

  vi.doMock(root + '/lib/utils.js', () => ({ getProviders: async () => providers }));
  vi.doMock(root + '/lib/services/storage/jobStorage.js', () => ({ getJobs: () => jobs }));

  module_ = await import(modulePath);
});

describe('reading a countries declaration', () => {
  it('means Germany when there is none', () => {
    expect(normalizeCountries(undefined)).toEqual(['de']);
    expect(normalizeCountries(null)).toEqual(['de']);
  });

  it('lowercases what it is given', () => {
    expect(normalizeCountries(['DE', 'Fr'])).toEqual(['de', 'fr']);
  });

  it('drops anything that is not an alpha-2 code', () => {
    expect(normalizeCountries(['ch', 'germany', 'x', 42, null, ''])).toEqual(['ch']);
  });

  // A provider file is written by whoever contributes it. A typo in this field must not be able to
  // stop Fredy from starting, which is why nothing here throws; the build-time guard that a typo
  // does not go unnoticed is in test/provider/providerMetaInformation.test.js.
  it('falls back to Germany when nothing usable survives', () => {
    expect(normalizeCountries(['nonsense'])).toEqual(['de']);
    expect(normalizeCountries([])).toEqual(['de']);
    expect(normalizeCountries('de')).toEqual(['de']);
  });

  it('deduplicates and sorts, so equivalent declarations produce one request', () => {
    expect(normalizeCountries(['fr', 'DE', 'fr'])).toEqual(['de', 'fr']);
    expect(unionCountries([['fr'], ['de', 'fr']])).toEqual(['de', 'fr']);
  });

  it('leaves the exported default alone', () => {
    normalizeCountries(['fr']).push('xx');
    expect([...DEFAULT_COUNTRIES]).toEqual(['de']);
  });
});

describe('the countries of one provider', () => {
  it('is Germany for a provider that declares nothing', async () => {
    await expect(module_.getCountriesForProvider('immowelt')).resolves.toEqual(['de']);
  });

  it('is what it declared otherwise', async () => {
    await expect(module_.getCountriesForProvider('swissportal')).resolves.toEqual(['ch']);
  });

  // A listing outlives the provider that found it: the module can be deleted from lib/provider while
  // its rows are still in the database waiting for the geocoding sweep.
  it('is Germany for a provider that no longer exists', async () => {
    await expect(module_.getCountriesForProvider('deleted-last-year')).resolves.toEqual(['de']);
  });
});

describe('the countries of several providers', () => {
  it('unions them', async () => {
    await expect(module_.getCountriesForProviderIds(['swissportal', 'benelux'])).resolves.toEqual([
      'be',
      'ch',
      'lu',
      'nl',
    ]);
  });

  it('folds an undeclared provider in as Germany', async () => {
    await expect(module_.getCountriesForProviderIds(['immowelt', 'swissportal'])).resolves.toEqual(['ch', 'de']);
  });

  // Otherwise one stale id in a query parameter would drag Germany into a union it has nothing to
  // do with, and the map would open wider than the job it belongs to.
  it('lets an unknown id contribute nothing', async () => {
    await expect(module_.getCountriesForProviderIds(['swissportal', 'ghost'])).resolves.toEqual(['ch']);
  });

  it('answers with the default when given nothing at all', async () => {
    await expect(module_.getCountriesForProviderIds([])).resolves.toEqual(['de']);
    await expect(module_.getCountriesForProviderIds(null)).resolves.toEqual(['de']);
  });
});

describe('the countries in scope for a user', () => {
  it('unions every provider across their jobs', async () => {
    jobs = [
      { userId: 'u1', provider: [{ id: 'immowelt' }] },
      { userId: 'u1', provider: [{ id: 'swissportal' }] },
    ];

    await expect(module_.getCountriesForUser('u1')).resolves.toEqual(['ch', 'de']);
  });

  it('ignores the jobs of other users', async () => {
    jobs = [
      { userId: 'u1', provider: [{ id: 'immowelt' }] },
      { userId: 'u2', provider: [{ id: 'swissportal' }] },
    ];

    await expect(module_.getCountriesForUser('u1')).resolves.toEqual(['de']);
  });

  // The maps read the same job list `GET /api/jobs` returns, which includes shared jobs. If the two
  // disagreed, a shared job's listings would sit outside the box the map allows.
  it('counts a job shared with them', async () => {
    jobs = [{ userId: 'u2', shared_with_user: ['u1'], provider: [{ id: 'swissportal' }] }];

    await expect(module_.getCountriesForUser('u1')).resolves.toEqual(['ch']);
  });

  it('is Germany for a user with no jobs yet', async () => {
    await expect(module_.getCountriesForUser('u1')).resolves.toEqual(['de']);
    await expect(module_.getCountriesForUser(null)).resolves.toEqual(['de']);
  });
});

describe('the providers of a set of countries', () => {
  it('finds the undeclared ones under Germany', async () => {
    await expect(module_.getProviderIdsForCountries(['de'])).resolves.toEqual(['immowelt']);
  });

  it('finds a provider by any one of the countries it declared', async () => {
    await expect(module_.getProviderIdsForCountries(['lu'])).resolves.toEqual(['benelux']);
  });

  it('takes everything overlapping a wider set', async () => {
    await expect(module_.getProviderIdsForCountries(['de', 'ch'])).resolves.toEqual(['immowelt', 'swissportal']);
  });

  it('answers with nothing when no provider serves the country', async () => {
    await expect(module_.getProviderIdsForCountries(['pl'])).resolves.toEqual([]);
  });
});
