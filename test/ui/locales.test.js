/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TRACKING_POIS } from '../../lib/TRACKING_POIS.js';
import { COMMUTE_ACTIONS } from '../../ui/src/services/jobs/commuteFilter.js';
import {
  CONNECTIVITY_SOURCES,
  DISPLAY_TECHNOLOGIES,
  DISPLAY_MOBILE_TECHNOLOGIES,
  FILTERABLE_TECHNOLOGIES,
  FILTERABLE_OPERATORS,
} from '../../ui/src/components/connectivity/connectivityFormat.js';
import { PLACE_CATEGORIES } from '../../ui/src/services/travelTime/placeCategories.js';

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
const uiSourceDir = path.join(localeDir, '..');

/**
 * English keys a translation has never been written for.
 *
 * A backlog, not a permission: the point of listing them is that everything *not* listed has to be
 * translated everywhere, so the next feature cannot quietly ship English-only into two of the three
 * languages. Shrinking this list is the only edit it should ever get.
 * @type {Record<string, string[]>}
 */
const UNTRANSLATED_BACKLOG = {
  'tr.json': [
    'listing.detail.editAddress',
    'listing.detail.editAddressHint',
    'listing.detail.addressSearchPlaceholder',
    'listing.detail.addressSave',
    'listing.detail.addressNotFound',
    'listing.detail.setAddressManually',
    'listing.detail.addressIsManual',
    'listing.detail.pinDropHint',
    'listing.detail.pinDropPicked',
    'listing.detail.pinDropSave',
    'listing.detail.toastAddressSaved',
    'listing.detail.toastAddressError',
    'map.expand',
    'map.collapse',
    'map.expandedLabel',
  ],
};

/**
 * Every `.js`/`.jsx` file under `ui/src`, so a translation call can be found wherever it lives.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'locales' ? [] : sourceFiles(full);
    }
    return /\.jsx?$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Keys the code builds rather than writes out, which no regex over the source can find.
 *
 * `t(`map.commuteBand.${band}`)` is three keys the map legend, the map pins and the listing cards
 * all depend on; a missing one shows up as the raw key painted next to a coloured dot.
 * @type {string[]}
 */
const COMPUTED_KEYS = [
  ...['transit', 'car', 'bike', 'walk'].map((mode) => `travelTime.mode.${mode}`),
  ...['good', 'acceptable', 'poor'].map((band) => `map.commuteBand.${band}`),
  // Both families are built from COMMUTE_ACTIONS, so the list below is the one place that has to be
  // kept in step with it - and the assertion below does exactly that rather than repeating the
  // three names a fourth time. A missing entry here would print `jobs.mutation.commuteAction.mark`
  // inside the dropdown that decides whether a listing is filtered out.
  ...COMMUTE_ACTIONS.map((action) => `jobs.mutation.commuteAction.${action}`),
  ...COMMUTE_ACTIONS.map((action) => `jobs.mutation.commuteActionHelp.${action}`),
  // Same idea for the connectivity card and its filters: every one of these is built from a list,
  // and a missing entry paints the raw key into a chip on the listing detail page.
  ...new Set(
    [...DISPLAY_MOBILE_TECHNOLOGIES, ...FILTERABLE_TECHNOLOGIES].map((technology) => `connectivity.tech.${technology}`),
  ),
  ...DISPLAY_TECHNOLOGIES.map((technology) => `connectivity.fixed.${technology}`),
  ...FILTERABLE_OPERATORS.map((code) => `connectivity.operator.${code}`),
  ...CONNECTIVITY_SOURCES.map((id) => `settings.connectivitySource.${id}`),
  ...CONNECTIVITY_SOURCES.map((id) => `settings.connectivitySourceHelp.${id}`),
  // The place types a travel time can be measured to. Built from the list rather than written out,
  // so adding a category is what adds the assertion - an unnamed one would otherwise reach the
  // dropdown in the travel time settings as the raw key next to its icon.
  ...PLACE_CATEGORIES.map((category) => `travelTime.placeCategory.${category.id}`),
];

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

  // The three checks below are what keeps a new feature from shipping half-translated. Between them
  // they cover both directions: a key the code asks for and no file answers, and a key english has
  // that a translation forgot.
  it('knows every key the app asks for by name', () => {
    const missing = new Map();
    for (const file of sourceFiles(uiSourceDir)) {
      for (const match of fs.readFileSync(file, 'utf-8').matchAll(TRANSLATION_CALL)) {
        if (!(match[1] in english)) {
          missing.set(match[1], path.relative(uiSourceDir, file));
        }
      }
    }
    expect(Object.fromEntries(missing)).toEqual({});
  });

  it('knows every key the app builds at runtime', () => {
    // Invisible to the pattern above, so they are named here instead of going unchecked.
    expect(COMPUTED_KEYS.filter((key) => !(key in english))).toEqual([]);
  });

  /**
   * A fourth commute action added to the list would be offered in the dropdown immediately and
   * would need two new keys in three files. Naming the two families here is what turns that into a
   * failing test rather than a raw key sitting in a select.
   */
  it('has a label and an explanation for every commute action there is', () => {
    for (const action of COMMUTE_ACTIONS) {
      expect(COMPUTED_KEYS).toContain(`jobs.mutation.commuteAction.${action}`);
      expect(COMPUTED_KEYS).toContain(`jobs.mutation.commuteActionHelp.${action}`);
    }
  });

  it.each(localeFiles)('%s translates every key english has', (file) => {
    const translated = new Set(Object.keys(readLocale(file)));
    const backlog = new Set(UNTRANSLATED_BACKLOG[file] ?? []);
    const missing = Object.keys(english).filter((key) => !translated.has(key) && !backlog.has(key));

    expect(missing).toEqual([]);
    // A backlog entry that has since been translated is stale, and a stale allowlist is how the
    // next untranslated key sneaks in behind it.
    expect([...backlog].filter((key) => translated.has(key) || !(key in english))).toEqual([]);
  });

  it.each(localeFiles)('%s carries no key english has never heard of', (file) => {
    // Usually a typo or a key that was renamed on one side only; either way the translation is
    // dead weight that reads as coverage.
    expect(Object.keys(readLocale(file)).filter((key) => !(key in english))).toEqual([]);
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
