/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const less = fs.readFileSync(path.join(root, 'ui/src/views/dashboard/Dashboard.less'), 'utf-8');
const jsx = fs.readFileSync(path.join(root, 'ui/src/views/dashboard/Dashboard.jsx'), 'utf-8');

/**
 * Spacing values a rule is allowed to carry. Anything else is a number someone typed instead of
 * reaching for the scale, which is exactly how a layout drifts away from its spec one rule at a
 * time.
 */
const ALLOWED_SPACING = /^(0|auto|inherit|@space-\d+|@dash-[a-z-]+)$/;

const SPACING_PROPERTIES =
  /(^|\s)(gap|row-gap|column-gap|margin|margin-top|margin-right|margin-bottom|margin-left|padding|padding-top|padding-right|padding-bottom|padding-left)\s*:\s*([^;{}]+);/g;

describe('Dashboard.less', () => {
  it('takes every spacing value from the scale, never a bare number', () => {
    const offenders = [];
    for (const match of less.matchAll(SPACING_PROPERTIES)) {
      const property = match[2];
      // `!important` is a weight, not a length: it says who wins the cascade and nothing about
      // the scale. Left in, it would fail `margin: 0 !important` for carrying a value that is not
      // a spacing token, which is the one thing that line does not do.
      const value = match[3].replace(/!important/g, '').trim();
      const parts = value.split(/\s+/);
      for (const part of parts) {
        if (!ALLOWED_SPACING.test(part)) {
          offenders.push(`${property}: ${value}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('lays the tiles out as four equal columns', () => {
    expect(less).toMatch(/&__kpis\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    expect(less).toMatch(/&__kpis\s*\{[\s\S]*?gap:\s*@space-4/);
  });

  it('keeps the main column fluid and only the rail fixed', () => {
    expect(less).toMatch(/&__grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+@dash-rail/);
    expect(less).toMatch(/&__grid\s*\{[\s\S]*?gap:\s*@space-6/);
    expect(less).toMatch(/@dash-rail:\s*400px/);
  });

  it('draws one card shell for the whole page', () => {
    expect(less).toMatch(/&__card\s*\{[\s\S]*?background:\s*@color-surface/);
    expect(less).toMatch(/&__card\s*\{[\s\S]*?border:\s*1px solid @color-border/);
    expect(less).toMatch(/&__card\s*\{[\s\S]*?border-radius:\s*@radius-card/);
    expect(less).toMatch(/&__card\s*\{[\s\S]*?padding:\s*@dash-card-pad/);
    expect(less).toMatch(/@dash-card-pad:\s*@space-5/);
  });

  it('gives both directions of the weekly change the same weight', () => {
    expect(less).toMatch(/&--up\s*\{\s*color:\s*@color-success/);
    expect(less).toMatch(/&--down\s*\{\s*color:\s*@color-error/);
  });

  it('aligns the three right-hand columns of the listing rows', () => {
    expect(less).toMatch(/&__latestPrice\s*\{[\s\S]*?width:\s*92px/);
    expect(less).toMatch(/&__latestSqm\s*\{[\s\S]*?width:\s*108px/);
    expect(less).toMatch(/&__latestAge\s*\{[\s\S]*?width:\s*74px/);
  });

  it('breaks to one column at the width the plan names', () => {
    expect(less).toMatch(/@dash-stack:\s*1180px/);
    expect(less).toMatch(/@media \(max-width: @dash-stack\)/);
  });

  it('has dropped the two wrappers the old layout was built from', () => {
    // Narrowed from /__panel/ to the class itself: the stylesheet's own comment explains what
    // replaced the old wrapper and names it, and a test that cannot tell a selector from the
    // sentence describing its removal forbids the explanation along with the thing.
    expect(less).not.toMatch(/dashboard__panel/);
    expect(less).not.toMatch(/__section-label/);
  });
});

describe('Dashboard.jsx', () => {
  it('spends no colour on a tile, because none of them mean anything', () => {
    expect(jsx).not.toMatch(/color="(blue|orange|green|purple)"/);
    expect(jsx.match(/color="plain"/g) ?? []).toHaveLength(4);
  });

  it('no longer lays the tiles out with the grid that floated them', () => {
    expect(jsx).not.toMatch(/<Row/);
    expect(jsx).not.toMatch(/<Col/);
  });

  it('names the population the medians are taken over', () => {
    expect(jsx).toMatch(/sampleSize/);
  });

  it('states no percentage when there is no previous week to compare against', () => {
    expect(jsx).toMatch(/changePct == null/);
  });
});
