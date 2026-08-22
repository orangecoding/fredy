/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getProviders } from '../../lib/utils.js';
import { normalizeCountries } from '../../lib/services/providers/countries.js';

/**
 * The shape of what every provider exports as `metaInformation`.
 *
 * `countries` is the reason this file exists. It is optional, it is read leniently - a code that is
 * not two letters is dropped and the provider quietly falls back to Germany - and that leniency is
 * deliberate: a contributed provider module must not be able to stop Fredy from starting. The cost
 * is that a typo would otherwise never be noticed, because the symptom is addresses silently
 * failing to geocode in a country nobody on the project searches. This is where it gets noticed.
 */
describe('provider metaInformation', () => {
  /** @type {any[]} */
  let providers;

  beforeAll(async () => {
    providers = await getProviders();
  });

  it('names every provider', () => {
    for (const provider of providers) {
      const meta = provider.metaInformation;
      expect(typeof meta?.id, `${meta?.name ?? 'a provider'}.id`).toBe('string');
      expect(typeof meta.name, `${meta.id}.name`).toBe('string');
      expect(typeof meta.baseUrl, `${meta.id}.baseUrl`).toBe('string');
    }
  });

  // The id is stored on every listing the provider finds, so two providers sharing one would mix
  // their listings together and the alive checker would probe them with the wrong module.
  it('gives every provider its own id', () => {
    const ids = providers.map((provider) => provider.metaInformation.id);
    expect([...new Set(ids)]).toHaveLength(ids.length);
  });

  it('declares countries as lowercase ISO 3166-1 alpha-2, when it declares them at all', () => {
    for (const provider of providers) {
      const { id, countries } = provider.metaInformation;
      if (countries === undefined) continue;

      expect(Array.isArray(countries), `${id}.countries must be an array`).toBe(true);
      expect(countries.length, `${id}.countries must not be empty - leave it out instead`).toBeGreaterThan(0);
      for (const code of countries) {
        expect(code, `${id}.countries contains a code that is not lowercase alpha-2`).toMatch(/^[a-z]{2}$/);
      }
    }
  });

  // The check above states the rule; this one states it as "nothing gets thrown away", which is the
  // failure that actually matters. A discarded code is a country the geocoder will not search.
  it('declares nothing the resolver would have to discard', () => {
    for (const provider of providers) {
      const { id, countries } = provider.metaInformation;
      if (countries === undefined) continue;

      expect(normalizeCountries(countries), `${id}.countries lost an entry when it was read`).toHaveLength(
        new Set(countries).size,
      );
    }
  });
});
