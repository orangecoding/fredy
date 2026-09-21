/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { countryToLanguage, pickLetterLanguage } from '../../../lib/services/application/language.js';

const AVAILABLE = ['de', 'en', 'it'];

describe('countryToLanguage', () => {
  it('writes German for Germany and Austria', () => {
    expect(countryToLanguage('de')).toBe('de');
    expect(countryToLanguage('at')).toBe('de');
  });

  it('writes German for Switzerland, because the only Swiss provider serves de-CH', () => {
    expect(countryToLanguage('ch')).toBe('de');
  });

  it('writes Italian for Italy', () => {
    expect(countryToLanguage('it')).toBe('it');
  });

  it('falls back to English for countries Fredy ships no letter for', () => {
    expect(countryToLanguage('es')).toBe('en');
    expect(countryToLanguage('pt')).toBe('en');
  });

  it('is not case sensitive about the country code', () => {
    expect(countryToLanguage('DE')).toBe('de');
  });

  it('falls back to English for missing or unknown countries', () => {
    expect(countryToLanguage(null)).toBe('en');
    expect(countryToLanguage(undefined)).toBe('en');
    expect(countryToLanguage('zz')).toBe('en');
  });
});

describe('pickLetterLanguage', () => {
  it("uses the portal's country language, not the interface language", () => {
    expect(pickLetterLanguage({ countries: ['it'], uiLanguage: 'de', available: AVAILABLE })).toBe('it');
  });

  it('takes the first country when a provider spans several that agree', () => {
    expect(pickLetterLanguage({ countries: ['de', 'at'], uiLanguage: 'en', available: AVAILABLE })).toBe('de');
  });

  it('falls back to the interface language when the country has no template', () => {
    expect(pickLetterLanguage({ countries: ['es'], uiLanguage: 'de', available: ['de', 'it'] })).toBe('de');
  });

  it('falls back to English when neither the country nor the interface language has a template', () => {
    expect(pickLetterLanguage({ countries: ['es'], uiLanguage: 'tr', available: AVAILABLE })).toBe('en');
  });

  it('uses the interface language when the provider declares no country', () => {
    expect(pickLetterLanguage({ countries: [], uiLanguage: 'it', available: AVAILABLE })).toBe('it');
    expect(pickLetterLanguage({ countries: null, uiLanguage: 'it', available: AVAILABLE })).toBe('it');
  });

  it('ends at English when nothing else is known', () => {
    expect(pickLetterLanguage({ countries: null, uiLanguage: null, available: AVAILABLE })).toBe('en');
  });

  it('honours an explicit override above everything else', () => {
    expect(pickLetterLanguage({ countries: ['it'], uiLanguage: 'de', available: AVAILABLE, override: 'en' })).toBe(
      'en',
    );
  });

  it('ignores an override for a language with no template rather than rendering nothing', () => {
    expect(pickLetterLanguage({ countries: ['it'], uiLanguage: 'de', available: AVAILABLE, override: 'tr' })).toBe(
      'it',
    );
  });
});

describe('pickLetterLanguage for countries Fredy ships no letter for', () => {
  it('writes English rather than the interface language, because the reader is not the writer', () => {
    // A Madrid agent reading a German letter is worse than one reading an English letter.
    expect(pickLetterLanguage({ countries: ['es'], uiLanguage: 'de', available: AVAILABLE })).toBe('en');
    expect(pickLetterLanguage({ countries: ['pt'], uiLanguage: 'de', available: AVAILABLE })).toBe('en');
  });

  it('still uses the interface language when no country is known at all', () => {
    expect(pickLetterLanguage({ countries: [], uiLanguage: 'it', available: AVAILABLE })).toBe('it');
  });

  it('takes the first country it can actually write to, not merely the first country', () => {
    // getCountriesForListing returns the declaration sorted when it cannot narrow, so Idealista
    // arrives as ['es','it','pt'] and Italian would never win a first-element test.
    expect(pickLetterLanguage({ countries: ['es', 'it', 'pt'], uiLanguage: 'de', available: AVAILABLE })).toBe('it');
  });
});
