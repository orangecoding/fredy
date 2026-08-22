/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { sortProviders, groupCountryOf, COUNTRY_ORDER } from '../../ui/src/services/providerOrder.js';
import { flagFor, flagsFor, labelWithFlags } from '../../ui/src/services/countryFlags.js';
import { getProviders } from '../../lib/utils.js';

/**
 * How the job form offers the providers.
 *
 * The picker used to sort on a property the option objects never carried, so it was ordered by
 * whatever the API answered with. That was survivable while every portal was German and stopped
 * being so the moment the list spanned three countries.
 */
const provider = (id, name, countries) => ({ id, name, countries });

describe('the order providers are offered in', () => {
  it('groups by country, most-covered market first', () => {
    const sorted = sortProviders([
      provider('flatfox', 'Flatfox', ['ch']),
      provider('willhaben', 'willhaben', ['at']),
      provider('immoscout', 'Immoscout', ['de']),
    ]);

    expect(sorted.map((p) => p.id)).toEqual(['immoscout', 'willhaben', 'flatfox']);
  });

  it('puts the largest portal of a market first, not the alphabetically first', () => {
    const sorted = sortProviders([
      provider('einsAImmobilien', '1a Immobilien', ['de']),
      provider('kleinanzeigen', 'Kleinanzeigen', ['de']),
      provider('immoscout', 'Immoscout', ['de']),
      provider('immowelt', 'Immowelt', ['de']),
    ]);

    expect(sorted.map((p) => p.id)).toEqual(['immoscout', 'immowelt', 'kleinanzeigen', 'einsAImmobilien']);
  });

  // Adding a provider should not require editing the ordering list just to make the picker work.
  it('sorts an unranked provider alphabetically, behind the ranked ones of its country', () => {
    const sorted = sortProviders([
      provider('zzz', 'Zulu Immobilien', ['de']),
      provider('aaa', 'Alpha Immobilien', ['de']),
      provider('immowelt', 'Immowelt', ['de']),
    ]);

    expect(sorted.map((p) => p.id)).toEqual(['immowelt', 'aaa', 'zzz']);
  });

  it('sorts a country nobody ranked behind every country that is ranked', () => {
    const sorted = sortProviders([
      provider('french', 'Un Portail', ['fr']),
      provider('flatfox', 'Flatfox', ['ch']),
      provider('immoscout', 'Immoscout', ['de']),
    ]);

    expect(sorted.map((p) => p.id)).toEqual(['immoscout', 'flatfox', 'french']);
  });

  it('leaves the array it was given alone', () => {
    const input = [provider('flatfox', 'Flatfox', ['ch']), provider('immoscout', 'Immoscout', ['de'])];
    sortProviders(input);

    expect(input.map((p) => p.id)).toEqual(['flatfox', 'immoscout']);
  });
});

describe('a provider covering several countries', () => {
  it('is filed under the first of them in the country order', () => {
    expect(groupCountryOf(provider('x', 'X', ['at', 'de']))).toBe('de');
    expect(groupCountryOf(provider('x', 'X', ['ch', 'at']))).toBe('at');
  });

  it('sorts with that country rather than being stranded at the end', () => {
    const sorted = sortProviders([
      provider('flatfox', 'Flatfox', ['ch']),
      provider('dach', 'DACH Portal', ['at', 'de']),
      provider('immoscout', 'Immoscout', ['de']),
    ]);

    expect(sorted.map((p) => p.id)).toEqual(['immoscout', 'dach', 'flatfox']);
  });

  it('still shows every flag it declared', () => {
    expect(labelWithFlags(provider('x', 'DACH Portal', ['de', 'at', 'ch']))).toBe('🇩🇪🇦🇹🇨🇭 DACH Portal');
  });
});

describe('the flag of a country', () => {
  it('is derived from the code, so a new country needs no entry anywhere', () => {
    expect(flagFor('de')).toBe('🇩🇪');
    expect(flagFor('AT')).toBe('🇦🇹');
    expect(flagFor('fr')).toBe('🇫🇷');
  });

  it('is nothing at all for something that is not a country code', () => {
    expect(flagFor('germany')).toBe('');
    expect(flagFor('')).toBe('');
    expect(flagFor(undefined)).toBe('');
    expect(flagsFor(undefined)).toBe('');
  });

  // The flag is decoration; a provider whose declaration is broken must still be pickable.
  it('leaves the name usable when there is no flag to show', () => {
    expect(labelWithFlags({ name: 'Immoscout' })).toBe('Immoscout');
  });
});

describe('the providers Fredy actually ships', () => {
  it('come out German first, then Austrian, then Swiss', async () => {
    const metas = (await getProviders()).map((p) => p.metaInformation);
    const countries = sortProviders(metas).map(groupCountryOf);
    const ranks = countries.map((code) => COUNTRY_ORDER.indexOf(code));

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(countries)).toEqual(new Set(['de', 'at', 'ch']));
  });

  it('lead with ImmoScout24, Immowelt and Kleinanzeigen', async () => {
    const metas = (await getProviders()).map((p) => p.metaInformation);

    expect(
      sortProviders(metas)
        .slice(0, 3)
        .map((p) => p.id),
    ).toEqual(['immoscout', 'immowelt', 'kleinanzeigen']);
  });
});
