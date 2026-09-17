/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { IMMOWELT_HOSTS, SITES, requireSite, siteOf } from '../../../lib/services/immowelt/site.js';

/**
 * Which site a url belongs to is the only thing that differs between immowelt.de and immowelt.at,
 * and it decides which country a job searches - so getting it wrong is silent rather than loud: the
 * run succeeds and reports the wrong country's flats.
 */
describe('#immowelt site', () => {
  it('reads both sites off a search url', () => {
    expect(siteOf('https://www.immowelt.de/classified-search?distributionTypes=Rent')?.country).toBe('de');
    expect(siteOf('https://www.immowelt.at/classified-search?distributionTypes=Rent')?.country).toBe('at');
  });

  it('reads a site off a listing link, which is what an exposé fetch has', () => {
    expect(siteOf('https://www.immowelt.at/expose/2abcde')?.origin).toBe('https://www.immowelt.at');
  });

  it('does not care about the www prefix', () => {
    expect(siteOf('https://immowelt.at/classified-search?x=1')?.country).toBe('at');
    expect(siteOf('https://IMMOWELT.DE/classified-search?x=1')?.country).toBe('de');
  });

  // Falling back to Germany would search the wrong country for a job that asked for another one,
  // and store every listing it found under a link to a site the user never named.
  it('answers null for anything that is not immowelt', () => {
    expect(siteOf('https://www.immowelt.ch/classified-search?x=1')).toBeNull();
    expect(siteOf('https://www.willhaben.at/iad/immobilien')).toBeNull();
    expect(siteOf('not a url')).toBeNull();
    expect(siteOf(null)).toBeNull();
    expect(siteOf(undefined)).toBeNull();
  });

  it('stops the run rather than guessing when a job url names no site', () => {
    expect(() => requireSite('https://www.example.org/search')).toThrow(/immowelt\.de and immowelt\.at/);
    expect(() => requireSite('https://www.immowelt.at/classified-search?x=1')).not.toThrow();
  });

  it('lists exactly the hosts it has a site for', () => {
    expect(IMMOWELT_HOSTS).toEqual(['immowelt.de', 'immowelt.at']);
    for (const host of IMMOWELT_HOSTS) {
      expect(new URL(SITES[host].origin).hostname).toBe(`www.${host}`);
    }
  });
});
