/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { todayHeadline } from '../../ui/src/services/dashboard/todayHeadline.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf-8');
const less = read('ui/src/views/dashboard/Dashboard.less');
const jsx = read('ui/src/views/dashboard/Dashboard.jsx');
const latest = read('ui/src/views/dashboard/components/LatestListings.jsx');
const jobsPanel = read('ui/src/views/dashboard/components/JobsPanel.jsx');

/**
 * Spacing values a rule is allowed to carry. Anything else is a number someone typed instead of
 * reaching for the scale, which is exactly how a layout drifts away from its spec one rule at a
 * time. The page's own constants (`@dash-*`) are named at the top of the stylesheet.
 */
const ALLOWED_SPACING = /^(0|auto|inherit|-?@space-\d+|-?@dash-[a-z-]+|10px)$/;

const SPACING_PROPERTIES =
  /(^|\s)(gap|row-gap|column-gap|margin|margin-top|margin-right|margin-bottom|margin-left|padding|padding-top|padding-right|padding-bottom|padding-left)\s*:\s*([^;{}]+);/g;

/** A translator that shows which key and parameters it was asked for. */
const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

describe('Dashboard.less', () => {
  it('takes every spacing value from the scale, never a bare number', () => {
    const offenders = [];
    for (const match of less.matchAll(SPACING_PROPERTIES)) {
      const property = match[2];
      // `!important` is a weight, not a length.
      const value = match[3].replace(/!important/g, '').trim();
      for (const part of value.split(/\s+/)) {
        if (!ALLOWED_SPACING.test(part)) {
          offenders.push(`${property}: ${value}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('separates the sections by space and boxes only the attention notice', () => {
    expect(less).toMatch(/@dash-gap:\s*@space-10/);
    expect(less).not.toMatch(/&__card\s*\{/);
    expect(less).toMatch(/&__attention\s*\{[\s\S]*?border:\s*1px solid rgb\(@color-warning-rgb/);
  });

  it('lays the newest listings out four, two and one up', () => {
    expect(less).toMatch(/&__listings\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    expect(less).toMatch(/@media \(max-width: @dash-two-up\)\s*\{\s*grid-template-columns:\s*repeat\(2/);
    expect(less).toMatch(/@media \(max-width: @dash-one-up\)\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it('draws the figures as one line between two rules', () => {
    expect(less).toMatch(
      /&__kpis\s*\{[\s\S]*?border-top:\s*1px solid @color-border;\s*border-bottom:\s*1px solid @color-border/,
    );
  });

  it('gives both directions of the weekly change the same weight', () => {
    expect(less).toMatch(/&--up\s*\{\s*color:\s*@color-success/);
    expect(less).toMatch(/&--down\s*\{\s*color:\s*@color-error/);
  });

  it('keeps red for the current week and the one action', () => {
    const accents = [...less.matchAll(/@color-accent\b/g)];
    expect(accents).toHaveLength(1);
    expect(less).toMatch(/&--current\s*\{\s*background:\s*@color-accent/);
  });

  it('asks for no tabular figures, which tear the punctuation of this face apart', () => {
    expect(less).not.toMatch(/tabular-nums/);
  });
});

describe('Dashboard.jsx', () => {
  it('leads with the newest listings as photographs, before the figures', () => {
    expect(jsx.indexOf('<LatestListings')).toBeLessThan(jsx.indexOf('dashboard__kpis'));
    expect(latest).toMatch(/listingPictureSrc\(row\)/);
  });

  it('names the population the medians are taken over', () => {
    expect(jsx).toMatch(/sampleSize/);
  });

  it('states no percentage when there is no previous week to compare against', () => {
    expect(jsx).toMatch(/changePct == null/);
  });

  it('spells out every reason a job wants attention, so the locale check can see the keys', () => {
    expect(jobsPanel).toMatch(/t\('dashboard\.jobReasonNoChannel'\)/);
    expect(jobsPanel).toMatch(/t\('dashboard\.jobReasonPaused'\)/);
    expect(jobsPanel).toMatch(/t\('dashboard\.jobReasonNothingFound'\)/);
  });
});

describe('todayHeadline', () => {
  const days = (...counts) => ({ perDay: counts.map((count, index) => ({ date: `2026-10-${10 + index}`, count })) });

  it('counts the last day of the trend', () => {
    expect(todayHeadline(days(3, 1, 6), t)).toBe('dashboard.todayMany:{"count":"6"}');
  });

  it('says one listing in the singular', () => {
    expect(todayHeadline(days(4, 1), t)).toBe('dashboard.todayOne');
  });

  it('says so when nothing came in today', () => {
    expect(todayHeadline(days(5, 0), t)).toBe('dashboard.todayNone');
  });

  it('falls back to the page name before the trend has arrived', () => {
    expect(todayHeadline(undefined, t)).toBe('dashboard.title');
    expect(todayHeadline({ perDay: [] }, t)).toBe('dashboard.title');
  });
});

describe('the charts beside the jobs', () => {
  const share = read('ui/src/components/cards/ProviderShareChart.jsx');
  const trend = read('ui/src/views/dashboard/components/TrendBars.jsx');

  // The ramp has five greys. Clamping every provider past the fifth to the last one drew several
  // identical segments and legend swatches that nothing told apart.
  it('folds the smallest portals into one "others" segment once there are more than five', () => {
    expect(share).toMatch(/rows\.length > ramp\.length/);
    expect(share).toMatch(/t\('dashboard\.providerOthers'\)/);
    expect(share).not.toMatch(/Math\.min\(index, ramp\.length - 1\)/);
  });

  // The lightest step of the ramp is 1.3:1 on the light page; the middle one clears 3:1 in both.
  it('draws the previous week in the middle grey, which stays visible in both themes', () => {
    expect(trend).toMatch(/shareRamp\(\)\[2\]/);
    expect(less).toMatch(/&__trendSwatch \{[\s\S]*?background: @color-chart-3;/);
  });
});
