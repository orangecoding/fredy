/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { TOUR_STEPS, buildTourSteps, stepBodyKey, stepTitleKey } from '../../ui/src/services/tour/tourSteps.js';
import { LEGACY_REDIRECTS } from '../../ui/src/services/routes/legacyRedirects.js';

const uiSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../ui/src');
const english = JSON.parse(fs.readFileSync(path.join(uiSrc, 'locales/en.json'), 'utf-8'));

/**
 * Every stylesheet and component under `ui/src`, concatenated, so a class name can be looked up
 * wherever it is defined.
 *
 * @param {string} dir
 * @returns {string}
 */
function readSources(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'locales' ? '' : readSources(full);
      return /\.(jsx?|less)$/.test(entry.name) && !full.includes(`${path.sep}tour${path.sep}`)
        ? fs.readFileSync(full, 'utf-8')
        : '';
    })
    .join('\n');
}

const ids = (steps) => steps.map((step) => step.id);

describe('onboarding tour steps', () => {
  it('walks an administrator through every page, the administration included', () => {
    expect(ids(buildTourSteps({ isAdmin: true, listingId: 'abc' }))).toEqual([
      'welcome',
      'dashboard',
      'jobCreate',
      'jobsOverview',
      'listingsOverview',
      'mapListings',
      'mapFilters',
      'finance',
      'listingDetail',
      'application',
      'settings',
      'admin',
      'finish',
    ]);
  });

  it('gives everybody else the same tour without the administration', () => {
    const admin = ids(buildTourSteps({ isAdmin: true, listingId: 'abc' }));
    const user = ids(buildTourSteps({ isAdmin: false, listingId: 'abc' }));
    expect(user).toEqual(admin.filter((id) => id !== 'admin'));
  });

  it('sends the detail steps to the example listing', () => {
    const steps = buildTourSteps({ isAdmin: false, listingId: 'a b' });
    const detail = steps.filter((step) => step.needsListing);
    expect(detail.map((step) => step.route)).toEqual(['/listings/listing/a%20b', '/listings/listing/a%20b']);
  });

  it('leaves out the detail steps when there is no example listing to open', () => {
    for (const listingId of [null, undefined, '']) {
      const steps = buildTourSteps({ isAdmin: false, listingId });
      expect(steps.some((step) => step.needsListing)).toBe(false);
      expect(steps.every((step) => !step.route.includes(':'))).toBe(true);
    }
  });

  it('starts with the welcome and ends with the farewell, both of which point at nothing', () => {
    const steps = buildTourSteps({ isAdmin: true, listingId: 'abc' });
    expect(steps[0]).toMatchObject({ id: 'welcome', target: null });
    expect(steps.at(-1)).toMatchObject({ id: 'finish', target: null });
  });

  it('only visits routes the app actually has', () => {
    const app = fs.readFileSync(path.join(uiSrc, 'App.jsx'), 'utf-8');
    for (const step of TOUR_STEPS) {
      const [top] = step.route.split('/').filter(Boolean);
      expect(app, step.id).toMatch(new RegExp(`path="/?${top}`));
      // A route that only exists as a legacy redirect would bounce the tour somewhere else.
      expect(Object.keys(LEGACY_REDIRECTS)).not.toContain(step.route);
    }
  });

  // The targets are class names the pages already carry. Renaming one in a view would otherwise
  // leave its step pointing at nothing, silently.
  it('points at class names that still exist in the pages', () => {
    const sources = readSources(uiSrc);
    for (const step of TOUR_STEPS.filter((candidate) => candidate.target != null)) {
      const className = step.target.replace(/^\./, '');
      expect(sources.includes(className), `${step.id}: ${step.target}`).toBe(true);
    }
  });

  it('has a heading and an explanation for every step', () => {
    for (const step of TOUR_STEPS) {
      expect(english, step.id).toHaveProperty([stepTitleKey(step.id)]);
      expect(english, step.id).toHaveProperty([stepBodyKey(step.id)]);
    }
  });

  it('uses unique step ids', () => {
    expect(new Set(ids(TOUR_STEPS)).size).toBe(TOUR_STEPS.length);
  });
});
