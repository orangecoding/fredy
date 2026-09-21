/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

const root = (await import('node:path')).resolve('.');

const listing = {
  id: 'abc',
  provider: 'immoscout',
  dealType: 'rent',
  title: 'Helle 3-Zimmer-Wohnung',
  address: 'Musterweg 1, 20255 Hamburg',
  price: 1200,
  size: 75,
  rooms: 3,
  link: 'https://example.com/expose/1',
  description: null,
};

const fullProfile = {
  firstName: 'Max',
  lastName: 'Mustermann',
  street: 'Beispielstraße 7',
  zip: '20259',
  city: 'Hamburg',
  phone: '0170 1234567',
  email: 'max@example.com',
  adults: 2,
  children: 1,
  occupation: 'Softwareentwickler',
  employer: 'Beispiel GmbH',
  employmentType: 'permanent',
  netIncome: 3800,
  moveInDate: '2026-12-01',
  smoker: false,
  schufa: true,
  guarantor: true,
  extra: 'Wir sind seit acht Jahren in Hamburg.',
};

/**
 * Load the service with its three impure neighbours replaced.
 *
 * @param {Object} [options]
 * @param {Record<string, any>} [options.settings] What `getUserSettings` returns for this user.
 * @param {string[]} [options.countries] What `getCountriesForListing` resolves for the listing.
 * @param {Array<{metaInformation: {id: string, name: string}}>} [options.providers]
 * @returns {Promise<typeof import('../../../lib/services/application/applicationService.js')>}
 */
async function loadService({ settings = {}, countries = ['de'], providers = [] } = {}) {
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getUserSettings: () => settings,
  }));
  vi.doMock(root + '/lib/services/providers/providerCountries.js', () => ({
    getCountriesForListing: async () => countries,
  }));
  vi.doMock(root + '/lib/utils.js', () => ({ getProviders: async () => providers }));
  return import(root + '/lib/services/application/applicationService.js');
}

describe('buildApplicationLetter language', () => {
  it("writes in the portal's language rather than the interface language", async () => {
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: fullProfile },
      countries: ['it'],
    });
    const result = await buildApplicationLetter(listing, 'user-1');
    expect(result.language).toBe('it');
    expect(result.text.startsWith('Oggetto:')).toBe(true);
  });

  it('writes English for a country it ships no letter for, rather than the interface language', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: fullProfile },
      countries: ['es'],
    });
    const result = await buildApplicationLetter(listing, 'user-1');
    expect(result.language).toBe('en');
  });

  it('honours an explicit language override', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: fullProfile },
      countries: ['de'],
    });
    const result = await buildApplicationLetter(listing, 'user-1', { language: 'en' });
    expect(result.language).toBe('en');
    expect(result.text.startsWith('Subject:')).toBe(true);
  });

  it('ignores an override for a language it cannot write', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: fullProfile },
      countries: ['de'],
    });
    const result = await buildApplicationLetter(listing, 'user-1', { language: 'tr' });
    expect(result.language).toBe('de');
  });
});

describe('buildApplicationLetter template choice', () => {
  it('writes a viewing request for a listing that is for sale', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: fullProfile },
    });
    const result = await buildApplicationLetter({ ...listing, dealType: 'buy' }, 'user-1');
    expect(result.dealType).toBe('buy');
    expect(result.text).toContain('Besichtigungsanfrage');
  });

  it("prefers the user's own template over the shipped one", async () => {
    const { buildApplicationLetter } = await loadService({
      settings: {
        language: 'de',
        applicant_profile: fullProfile,
        application_templates: { de: { rent: 'Hallo, ich bin {{applicant.fullName}}.' } },
      },
    });
    const result = await buildApplicationLetter(listing, 'user-1');
    expect(result.text).toBe('Hallo, ich bin Max Mustermann.');
  });

  it('keeps using the shipped template for a deal type the user has not overridden', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: {
        language: 'de',
        applicant_profile: fullProfile,
        application_templates: { de: { rent: 'Eigenes Mietanschreiben' } },
      },
    });
    const result = await buildApplicationLetter({ ...listing, dealType: 'buy' }, 'user-1');
    expect(result.text).toContain('Besichtigungsanfrage');
  });
});

describe('buildApplicationLetter profile reporting', () => {
  it('reports that no profile exists and names what it would have used', async () => {
    const { buildApplicationLetter } = await loadService({ settings: { language: 'de' } });
    const result = await buildApplicationLetter(listing, 'user-1');
    expect(result.hasProfile).toBe(false);
    expect(result.missing).toContain('applicant.fullName');
    expect(result.missing).toContain('applicant.netIncome');
  });

  it('reports a profile that exists even when half of it is blank', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: { firstName: 'Max' } },
    });
    const result = await buildApplicationLetter(listing, 'user-1');
    expect(result.hasProfile).toBe(true);
    expect(result.missing).toContain('applicant.occupation');
  });

  it('treats an empty profile object as no profile', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: {} },
    });
    expect((await buildApplicationLetter(listing, 'user-1')).hasProfile).toBe(false);
  });

  it('does not report an unanswered yes/no question as a gap in the profile', async () => {
    // Four flag chips on every fresh profile would drown the fields that actually always help.
    const profile = { ...fullProfile };
    for (const flag of ['schufa', 'smoker', 'wbs', 'guarantor']) delete profile[flag];
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: profile },
    });
    const result = await buildApplicationLetter(listing, 'user-1');
    expect(result.missing).toEqual([]);
  });

  it('does not report an optional note as a gap either', async () => {
    const profile = { ...fullProfile };
    delete profile.extra;
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: profile },
    });
    expect((await buildApplicationLetter(listing, 'user-1')).missing).toEqual([]);
  });

  it('does still report a fact the letter wanted and the profile does not hold', async () => {
    const profile = { ...fullProfile };
    delete profile.occupation;
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: profile },
    });
    expect((await buildApplicationLetter(listing, 'user-1')).missing).toContain('applicant.occupation');
  });

  it('reports nothing missing for a complete profile', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: fullProfile },
    });
    const result = await buildApplicationLetter(listing, 'user-1');
    expect(result.missing).toEqual([]);
    expect(result.unknown).toEqual([]);
  });
});

describe('buildApplicationLetter contact', () => {
  it('addresses the agent by name when ImmoScout published one', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: fullProfile },
    });
    const result = await buildApplicationLetter(
      { ...listing, description: 'Agent: Frau Muster (Muster GmbH) - 5 stars\n\nSchöne Wohnung.' },
      'user-1',
    );
    expect(result.text).toContain('Guten Tag Frau Muster,');
    expect(result.contact).toEqual({ name: 'Frau Muster', company: 'Muster GmbH' });
  });

  it("does not let another portal's advertiser write the salutation", async () => {
    // The `Agent:` line is a format Fredy itself prepends, and only for ImmoScout. Parsing it out
    // of any description makes whoever wrote the advert the author of the greeting.
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: fullProfile },
    });
    const result = await buildApplicationLetter(
      { ...listing, provider: 'kleinanzeigen', description: 'Agent: Frau Muster (Muster GmbH) - 5 stars\n' },
      'user-1',
    );
    expect(result.contact).toBeNull();
    expect(result.text).toContain('Sehr geehrte Damen und Herren,');
  });

  it('falls back to an unaddressed greeting, which is what nearly every provider yields', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: fullProfile },
    });
    const result = await buildApplicationLetter(listing, 'user-1');
    expect(result.text).toContain('Sehr geehrte Damen und Herren,');
    expect(result.contact).toBeNull();
  });
});

describe('buildApplicationLetter provider name', () => {
  it('uses the portal name a provider declares rather than its internal id', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: {
        language: 'de',
        applicant_profile: fullProfile,
        application_templates: { de: { rent: '{{listing.provider}}' } },
      },
      providers: [{ metaInformation: { id: 'immoscout', name: 'Immoscout' } }],
    });
    expect((await buildApplicationLetter(listing, 'user-1')).text).toBe('Immoscout');
  });

  it('reports the portal name alongside the letter, so the dialog can say why it chose a language', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: fullProfile },
      providers: [{ metaInformation: { id: 'immoscout', name: 'Immoscout' } }],
    });
    const result = await buildApplicationLetter(listing, 'user-1');
    expect(result.providerName).toBe('Immoscout');
  });

  it('reports the provider id as the portal name when nothing better is known', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: { language: 'de', applicant_profile: fullProfile },
      providers: [],
    });
    expect((await buildApplicationLetter(listing, 'user-1')).providerName).toBe('immoscout');
  });

  it('falls back to the provider id when no provider declares that portal', async () => {
    const { buildApplicationLetter } = await loadService({
      settings: {
        language: 'de',
        applicant_profile: fullProfile,
        application_templates: { de: { rent: '{{listing.provider}}' } },
      },
      providers: [],
    });
    expect((await buildApplicationLetter(listing, 'user-1')).text).toBe('immoscout');
  });
});
