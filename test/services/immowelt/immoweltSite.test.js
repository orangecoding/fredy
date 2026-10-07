/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { IMMOWELT_HOSTS, SITES, linkedSiteOf, requireSite, siteOf } from '../../../lib/services/immowelt/site.js';

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
    expect(() => requireSite('https://www.example.org/search', 'immowelt')).toThrow(/immowelt\.de and immowelt\.at/);
    expect(() => requireSite('https://www.immowelt.at/classified-search?x=1', 'immowelt')).not.toThrow();
  });

  it('lists exactly the hosts it has a site for', () => {
    expect(IMMOWELT_HOSTS).toEqual(['immowelt.de', 'immowelt.at']);
    for (const host of IMMOWELT_HOSTS) {
      expect(new URL(SITES[host].origin).hostname).toBe(`www.${host}`);
    }
  });
});

/**
 * SeLoger is the same application a third time, and a provider of its own. The table serves both,
 * so what has to hold is that each provider searches only its own sites - the shared BFF would
 * answer the other's url without complaint.
 */
describe('#immowelt site, SeLoger', () => {
  it('reads SeLoger off its urls, in French', () => {
    const site = siteOf('https://www.seloger.com/classified-search?distributionTypes=Rent');
    expect(site).toMatchObject({
      provider: 'seloger',
      country: 'fr',
      language: 'fr',
      origin: 'https://www.seloger.com',
    });
  });

  it('finds the origin of a SeLoger exposé, which is what the shared exposé fetch needs', () => {
    expect(siteOf('https://www.seloger.com/annonce/location/ile-de-france/paris-75/paris-75000/26ABC')?.origin).toBe(
      'https://www.seloger.com',
    );
  });

  it("lets each provider search its own sites and nobody else's", () => {
    expect(() => requireSite('https://www.seloger.com/classified-search?x=1', 'seloger')).not.toThrow();
    expect(() => requireSite('https://www.immowelt.de/classified-search?x=1', 'seloger')).toThrow(
      /SeLoger serves seloger\.com and nothing else/,
    );
    expect(() => requireSite('https://www.seloger.com/classified-search?x=1', 'immowelt')).toThrow(
      /Immowelt serves immowelt\.de and immowelt\.at/,
    );
  });

  it("keeps its host out of immowelt's", () => {
    expect(IMMOWELT_HOSTS).not.toContain('seloger.com');
    expect(SITES['seloger.com'].origin).toBe('https://www.seloger.com');
  });

  // Belles Demeures' adverts come back among SeLoger's results with links to the sister site. Fredy
  // asks there whether they are still online, and nothing else: it never searches that site.
  it('knows the sister site for asking about an advert, never for searching it', () => {
    const link = 'https://www.bellesdemeures.com/annonces/vente/appartement/paris-75/123456.htm';

    expect(linkedSiteOf(link)).toMatchObject({ provider: 'seloger', origin: 'https://www.bellesdemeures.com' });
    expect(siteOf(link)).toBeNull();
    expect(() => requireSite('https://www.bellesdemeures.com/recherche?x=1', 'seloger')).toThrow(/SeLoger serves/);
  });
});
