/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  normalizeHost as backendHost,
  validateProviderUrl as backendValidate,
} from '../../lib/services/jobs/providerUrl.js';
import {
  normalizeHost as frontendHost,
  validateProviderUrl as frontendValidate,
} from '../../ui/src/services/jobs/providerUrl.js';

/**
 * The frontend may not import out of lib/ - a lint rule enforces it, because server code is free to
 * grow a Node built-in and break the Vite build far from the cause. So the check is written twice,
 * and this is what stops the copies drifting.
 *
 * Drift here is not cosmetic: the job form refuses a pasted URL that is only the portal's homepage,
 * and the MCP job interview refuses the same one. Two different answers means a job the form would
 * never have saved can be created over MCP, run on schedule, and quietly find nothing.
 */
const PROVIDER = { id: 'immoscout', name: 'Immoscout', baseUrl: 'https://www.immobilienscout24.de/' };

const URLS = [
  'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/koeln/wohnung-mieten',
  // Right host, but nothing past it: the homepage, in its four spellings.
  'https://www.immobilienscout24.de/',
  'https://www.immobilienscout24.de',
  'https://immobilienscout24.de/',
  'immobilienscout24.de',
  // Query or fragment alone is a search.
  'https://www.immobilienscout24.de/?price=500.0-1200.0',
  'https://www.immobilienscout24.de/#/suche',
  // A trailing slash run must not read as a path.
  'https://www.immobilienscout24.de///',
  // Wrong host, including one that merely contains the right one.
  'https://www.immowelt.de/suche/koeln/wohnungen/mieten',
  'https://www.immobilienscout24.de.evil.example/Suche',
  // Protocol-relative and protocol-less input.
  '//www.immobilienscout24.de/Suche',
  'www.immobilienscout24.de/Suche/de',
  // Unparsable, empty, whitespace.
  'http://',
  'ht!tp://nope',
  '',
  '   ',
];

describe('provider URL validation stays in sync between the frontend copy and lib/', () => {
  it.each(URLS)('agrees on the host of %s', (url) => {
    expect(frontendHost(url)).toBe(backendHost(url));
  });

  it.each(URLS)('agrees on %s', (url) => {
    expect(frontendValidate(url, PROVIDER)).toEqual(backendValidate(url, PROVIDER));
  });

  it.each([[null], [undefined], [42], [{}]])('agrees on the non-string %s', (value) => {
    expect(frontendHost(value)).toBe(backendHost(value));
    expect(frontendValidate(value, PROVIDER)).toEqual(backendValidate(value, PROVIDER));
  });

  it.each([[null], [undefined], [{}], [{ baseUrl: 'not a url' }]])('agrees on the provider %s', (provider) => {
    expect(frontendValidate(URLS[0], provider)).toEqual(backendValidate(URLS[0], provider));
  });

  it('actually classifies rather than refusing or accepting everything', () => {
    // Two copies that both answered the same single value would pass every equality check above.
    // This is what makes the agreement meaningful.
    const problems = new Set(URLS.map((url) => frontendValidate(url, PROVIDER).problem));
    expect(problems.size).toBeGreaterThan(3);
    expect(frontendValidate(URLS[0], PROVIDER)).toEqual({
      ok: true,
      problem: null,
      expectedHost: 'immobilienscout24.de',
    });
    expect(frontendValidate('https://www.immobilienscout24.de/', PROVIDER).problem).toBe('bareHost');
    expect(frontendValidate('https://www.immowelt.de/suche', PROVIDER).problem).toBe('wrongHost');
    expect(frontendValidate('', PROVIDER).problem).toBe('empty');
    expect(frontendValidate(URLS[0], null).problem).toBe('noProvider');
  });
});
