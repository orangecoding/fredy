/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { normalizeHost, validateProviderUrl } from '../../ui/src/services/jobs/providerUrl.js';

const immoscout = {
  id: 'immoscout',
  name: 'Immoscout',
  baseUrl: 'https://www.immobilienscout24.de/',
};

describe('normalizeHost', () => {
  it.each([
    ['https://www.immobilienscout24.de/', 'immobilienscout24.de'],
    ['http://immobilienscout24.de/Suche', 'immobilienscout24.de'],
    ['www.immobilienscout24.de', 'immobilienscout24.de'],
    ['IMMOBILIENSCOUT24.DE', 'immobilienscout24.de'],
  ])('reduces %s to its bare host', (url, expected) => {
    expect(normalizeHost(url)).toBe(expected);
  });

  it.each([[null], [undefined], [''], ['   '], ['http://']])('answers null for %s', (url) => {
    expect(normalizeHost(url)).toBeNull();
  });
});

describe('validateProviderUrl', () => {
  it('accepts a real search url', () => {
    const result = validateProviderUrl(
      'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/koeln/wohnung-mieten',
      immoscout,
    );
    expect(result).toMatchObject({ ok: true, problem: null, expectedHost: 'immobilienscout24.de' });
  });

  it.each([
    ['a query-only search', 'https://www.immobilienscout24.de/?price=-1200'],
    ['a fragment-only search', 'https://www.immobilienscout24.de/#/results'],
    ['a url typed without its protocol', 'www.immobilienscout24.de/Suche/de/koeln/wohnung-mieten'],
  ])('accepts %s', (_what, url) => {
    expect(validateProviderUrl(url, immoscout).ok).toBe(true);
  });

  it.each([
    ['https://www.immobilienscout24.de/'],
    ['https://www.immobilienscout24.de'],
    ['https://immobilienscout24.de//'],
    ['immobilienscout24.de'],
  ])('refuses the bare homepage %s', (url) => {
    // The old check passed these. They save cleanly, run on schedule, and find nothing - which
    // looks exactly like a working job that the portal has no results for.
    const result = validateProviderUrl(url, immoscout);
    expect(result.ok).toBe(false);
    expect(result.problem).toBe('bareHost');
  });

  it('refuses a search on the wrong portal, and says which one was expected', () => {
    const result = validateProviderUrl('https://www.immowelt.de/suche/koeln/wohnungen/mieten', immoscout);
    expect(result).toMatchObject({ ok: false, problem: 'wrongHost', expectedHost: 'immobilienscout24.de' });
  });

  it.each([
    ['no provider picked', 'https://www.immobilienscout24.de/Suche/x', null, 'noProvider'],
    ['an empty url', '', immoscout, 'empty'],
    ['a whitespace url', '   ', immoscout, 'empty'],
    ['a missing url', null, immoscout, 'empty'],
    ['something that is not a url', 'not a url at all', immoscout, 'unparsable'],
  ])('refuses %s', (_what, url, provider, problem) => {
    const result = validateProviderUrl(url, provider);
    expect(result.ok).toBe(false);
    expect(result.problem).toBe(problem);
  });

  it('reports the expected host even when the input is wrong, so the message can name it', () => {
    expect(validateProviderUrl('', immoscout).expectedHost).toBe('immobilienscout24.de');
  });

  it('refuses a provider whose base url is unusable rather than accepting anything', () => {
    const broken = { id: 'x', name: 'X', baseUrl: '' };
    expect(validateProviderUrl('https://anything.example/search', broken)).toMatchObject({
      ok: false,
      problem: 'wrongHost',
    });
  });
});
