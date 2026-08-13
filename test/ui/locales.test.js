/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TRACKING_POIS } from '../../lib/TRACKING_POIS.js';

const localeDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../ui/src/locales');
const donateComponent = fs.readFileSync(path.join(localeDir, '../components/donate/Donate.jsx'), 'utf-8');

/**
 * Reads a locale file and returns its translations without the _meta block.
 * @param {string} file - file name inside ui/src/locales
 * @returns {Record<string, string>}
 */
function readLocale(file) {
  const translations = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf-8'));
  delete translations._meta;
  return translations;
}

const localeFiles = fs.readdirSync(localeDir).filter((file) => file.endsWith('.json'));
const english = readLocale('en.json');

/**
 * A `t('some.key')` translation call in a component.
 *
 * The lookbehind is what keeps this honest: without it the pattern also matches the tail of any
 * method whose name ends in `t`, so an ordinary `params.get('returnTo')` or `url.set('x')` would be
 * reported as a missing translation key and fail the suite for no reason.
 * @type {RegExp}
 */
const TRANSLATION_CALL = /(?<![\w.$])t\('([^']+)'\)/g;

describe('locales', () => {
  it('ships english as the fallback language', () => {
    expect(localeFiles).toContain('en.json');
  });

  it.each(localeFiles)('%s has no empty translations', (file) => {
    const empty = Object.entries(readLocale(file))
      .filter(([, value]) => typeof value !== 'string' || value.trim().length === 0)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('translates every key the login screen uses', () => {
    const login = fs.readFileSync(path.join(localeDir, '../views/login/Login.jsx'), 'utf-8');
    const usedKeys = [...login.matchAll(TRANSLATION_CALL)].map((match) => match[1]);

    expect(usedKeys.length).toBeGreaterThan(0);
    for (const key of usedKeys) {
      expect(Object.keys(english)).toContain(key);
    }
  });

  // Guards the pattern itself rather than a component, so the next `.get('x')` added to a screen
  // fails review on its merits instead of on a phantom missing translation.
  it('reads translation calls without mistaking methods that merely end in t', () => {
    const source = `
      const label = t('login.usernameLabel');
      const returnTo = new URLSearchParams(location.search).get('returnTo');
      url.searchParams.set('page');
      const first = items.at('0');
      const shown = pending ? t('login.loginButtonPending') : t('login.loginButton');
    `;

    expect([...source.matchAll(TRANSLATION_CALL)].map((match) => match[1])).toEqual([
      'login.usernameLabel',
      'login.loginButtonPending',
      'login.loginButton',
    ]);
  });

  it('translates every key the donate dialog uses', () => {
    // Two shapes to catch: t('donate.title') and the label keys held in DONATION_TARGETS.
    const usedKeys = [...new Set([...donateComponent.matchAll(/'(donate\.[a-zA-Z0-9]+)'/g)].map((match) => match[1]))];

    expect(usedKeys.length).toBeGreaterThan(0);
    for (const key of usedKeys) {
      expect(Object.keys(english)).toContain(key);
    }
  });

  it('only references donation tracking POIs that exist', () => {
    // A misspelled POI sends `{ poi: undefined }`, the route answers 400 and the store swallows
    // the failure in a console.error - the counter would sit at zero without anyone noticing.
    // Both reference shapes: pois.DONATION_MODAL_OPENED and the quoted keys in DONATION_TARGETS.
    const usedPois = [
      ...new Set([...donateComponent.matchAll(/(?:pois\.|')(DONATION_[A-Z_]+)/g)].map((match) => match[1])),
    ];

    expect(usedPois.length).toBe(4);
    for (const poi of usedPois) {
      expect(Object.keys(TRACKING_POIS)).toContain(poi);
    }
  });
});
