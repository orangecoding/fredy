/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  TOUR_STEPS,
  buildTourSteps,
  isActionDone,
  isOnStepPage,
  stepBodyKey,
  stepTitleKey,
} from '../../ui/src/services/tour/tourSteps.js';
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
  it('walks an administrator through every page, alternating explanations and clicks', () => {
    expect(ids(buildTourSteps({ isAdmin: true, listingId: 'abc' }))).toEqual([
      'welcome',
      'dashboard',
      'goJobs',
      'jobsOverview',
      'goNewJob',
      'jobCreate',
      'goListings',
      'listingsOverview',
      'openListing',
      'listingDetail',
      'application',
      'goMap',
      'mapListings',
      'mapFilters',
      'goFinance',
      'finance',
      'goSettings',
      'settings',
      'goAdmin',
      'admin',
      'finish',
    ]);
  });

  it('gives everybody else the same tour without the administration', () => {
    const admin = ids(buildTourSteps({ isAdmin: true, listingId: 'abc' }));
    const user = ids(buildTourSteps({ isAdmin: false, listingId: 'abc' }));
    expect(user).toEqual(admin.filter((id) => id !== 'admin' && id !== 'goAdmin'));
  });

  it('never asks for a click on a page the user has not been led to', () => {
    // Every action step starts where the step before it left the user.
    for (const isAdmin of [true, false]) {
      const steps = buildTourSteps({ isAdmin, listingId: 'abc' });
      steps.forEach((step, index) => {
        if (step.type !== 'action' || index === 0) return;
        expect(isOnStepPage(step, steps[index - 1].route), step.id).toBe(true);
      });
    }
  });

  it('lands every action on the page the next step explains', () => {
    const steps = buildTourSteps({ isAdmin: true, listingId: 'abc' });
    steps.forEach((step, index) => {
      if (step.type !== 'action') return;
      const next = steps[index + 1];
      expect(isActionDone(step, next.route), step.id).toBe(true);
      expect(isOnStepPage(next, next.route), next.id).toBe(true);
    });
  });

  it('counts an action as done only on the page it leads to', () => {
    const goJobs = TOUR_STEPS.find((step) => step.id === 'goJobs');
    const goSettings = TOUR_STEPS.find((step) => step.id === 'goSettings');
    expect(isActionDone(goJobs, '/jobs')).toBe(true);
    expect(isActionDone(goJobs, '/dashboard')).toBe(false);
    expect(isActionDone(goJobs, '/jobsx')).toBe(false);
    // The settings entry redirects to its first tab.
    expect(isActionDone(goSettings, '/settings/preferences')).toBe(true);
    expect(isActionDone(TOUR_STEPS[0], '/dashboard')).toBe(false);
  });

  it('points sidebar entries inside a closed group at the group first opened', () => {
    const goMap = TOUR_STEPS.find((step) => step.id === 'goMap');
    expect(goMap.targets).toEqual(['[data-tour="/map"]', '[data-tour="listings"]']);
    expect(goMap.groupKey).toBe('nav.listings');
  });

  it('sends the listing steps to the example listing, but accepts any listing the user opened', () => {
    const detail = buildTourSteps({ isAdmin: false, listingId: 'a b' }).find((step) => step.id === 'listingDetail');
    expect(detail.route).toBe('/listings/listing/a%20b');
    expect(isOnStepPage(detail, '/listings/listing/other')).toBe(true);
  });

  it('leaves out the listing steps when there is no example listing to open', () => {
    for (const listingId of [null, undefined, '']) {
      const steps = buildTourSteps({ isAdmin: false, listingId });
      expect(steps.some((step) => step.needsListing)).toBe(false);
      expect(steps.every((step) => !step.route.includes(':'))).toBe(true);
    }
  });

  it('starts with the welcome and ends with the farewell, both of which point at nothing', () => {
    const steps = buildTourSteps({ isAdmin: true, listingId: 'abc' });
    expect(steps[0]).toMatchObject({ id: 'welcome', targets: [] });
    expect(steps.at(-1)).toMatchObject({ id: 'finish', targets: [] });
  });

  it('only visits routes the app actually has', () => {
    const app = fs.readFileSync(path.join(uiSrc, 'App.jsx'), 'utf-8');
    for (const step of TOUR_STEPS) {
      const [top] = step.route.split('/').filter(Boolean);
      expect(app, step.id).toMatch(new RegExp(`path="/?${top}`));
      expect(Object.keys(LEGACY_REDIRECTS)).not.toContain(step.route);
    }
  });

  // The targets are class names and data-tour attributes the pages carry. Renaming one in a view
  // would otherwise leave its step pointing at nothing, silently.
  it('points at class names and data-tour attributes that still exist in the pages', () => {
    const sources = readSources(uiSrc);
    for (const step of TOUR_STEPS) {
      for (const target of step.targets) {
        const tour = /^\[data-tour="(.+)"\]$/.exec(target);
        if (tour != null) {
          const literal = sources.includes(`data-tour="${tour[1]}"`);
          const fromNav = sources.includes('data-tour={node.key}') || sources.includes('data-tour={child.key}');
          expect(literal || fromNav, `${step.id}: ${target}`).toBe(true);
        } else {
          expect(sources.includes(target.replace(/^\./, '')), `${step.id}: ${target}`).toBe(true);
        }
      }
    }
  });

  it('has a heading and an explanation for every step, and a label for every control it names', () => {
    for (const step of TOUR_STEPS) {
      expect(english, step.id).toHaveProperty([stepTitleKey(step.id)]);
      expect(english, step.id).toHaveProperty([stepBodyKey(step.id)]);
      if (step.labelKey) expect(english, step.id).toHaveProperty([step.labelKey]);
      if (step.groupKey) expect(english, step.id).toHaveProperty([step.groupKey]);
    }
  });

  it('uses unique step ids', () => {
    expect(new Set(ids(TOUR_STEPS)).size).toBe(TOUR_STEPS.length);
  });
});
