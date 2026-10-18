/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const less = fs.readFileSync(path.join(root, 'ui/src/components/navigation/Navigate.less'), 'utf-8');
const jsx = fs.readFileSync(path.join(root, 'ui/src/components/navigation/Navigation.jsx'), 'utf-8');

/**
 * Spacing values a rule is allowed to carry. Anything else is a number someone typed instead of
 * reaching for the scale, which is how a layout drifts away from its spec one rule at a time.
 *
 * The few that are not on the scale are the sidebar's own grid: 10px is the inset of an entry's
 * icon from the row edge, which every row repeats so the icons stand in one column; 2px is the gap
 * between rows; 4px and 6px centre the status dot and the account card's logout button on that
 * same column.
 */
const ALLOWED_SPACING = /^(0|auto|inherit|-?@space-\d+|-?@nav-[a-z-]+|1px|2px|4px|6px|10px)$/;

const SPACING_PROPERTIES =
  /(^|\s)(gap|row-gap|column-gap|margin|margin-top|margin-right|margin-bottom|margin-left|padding|padding-top|padding-right|padding-bottom|padding-left)\s*:\s*([^;{}]+);/g;

describe('Navigate.less', () => {
  it('takes every spacing value from the scale or from a named constant', () => {
    const offenders = [];
    for (const match of less.matchAll(SPACING_PROPERTIES)) {
      const value = match[3].trim();
      for (const part of value.split(/\s+/)) {
        if (!ALLOWED_SPACING.test(part)) {
          offenders.push(`${match[2]}: ${value}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has stopped fighting the component library', () => {
    expect(less).not.toMatch(/semi-navigation/);
    expect(jsx).not.toMatch(/\bNav\b/);
  });

  it('keeps the widths the design names', () => {
    expect(less).toMatch(/@nav-wide:\s*224px/);
    expect(less).toMatch(/@nav-narrow:\s*64px/);
    expect(less).toMatch(/@nav-item:\s*38px/);
  });

  it('gives a selected entry one signal, and it is not red', () => {
    const active = less.match(/&--active,\s*&--active:hover\s*\{[\s\S]*?\n {4}\}/);
    expect(active).not.toBeNull();
    // Its own token: elevated in the dark theme, a grey step below white in the light one, where an
    // elevated (white) row on the off-white page read as a card rather than as a selection.
    expect(active[0]).toMatch(/background:\s*@color-selected/);
    expect(active[0]).not.toMatch(/border|@color-accent/);
  });

  it('draws no glow, gradient or animation', () => {
    expect(less).not.toMatch(/gradient\(|@keyframes|animation:|box-shadow/);
  });

  it('lists every place at the top level', () => {
    expect(jsx).not.toMatch(/navigate__child|aria-expanded|flyout/);
  });

  it('no longer paints signing out as an error', () => {
    expect(less).not.toMatch(/logout-btn/);
    expect(less).not.toMatch(/@color-error/);
  });

  it('builds every entry as a real button', () => {
    expect(jsx).not.toMatch(/<div[^>]*onClick/);
    expect(jsx).toMatch(/type="button"/);
  });

  // The attribute is conditional - an entry that is not the current page must not carry it at all,
  // because `aria-current="false"` still announces as a landmark in several screen readers. That
  // makes the value an expression in the source rather than a literal string, so the pattern looks
  // for the expression and not for the rendered spelling.
  it('marks the current page for assistive technology', () => {
    expect(jsx).toMatch(/aria-current=\{[^}]*'page'/);
  });

  // The listings count and the next-run line come with the overview's figures. Landing anywhere else
  // left them out until the overview had been opened, and after a sign-in the store could still hold
  // the previous session's numbers - so the sidebar asks once per mount, except on the overview,
  // which asks for the same answer itself.
  it('asks for the overview figures itself, once per mount and never twice on the overview', () => {
    expect(jsx).toMatch(
      /useEffect\(\(\) => \{\s*if \(!location\.pathname\.startsWith\('\/dashboard'\)\) actions\.dashboard\.getDashboard\(\);\s*\}, \[\]\);/,
    );
  });

  it('takes the counts from the store rather than counting on its own', () => {
    expect(jsx).toMatch(/state\.jobsData\.jobs\?\.length/);
    expect(jsx).toMatch(/state\.dashboard\.data\?\.kpis\?\.numberOfActiveListings/);
  });

  it('scrolls instead of cutting off the account menu on a short window', () => {
    expect(less).toMatch(/overflow-y:\s*auto/);
    expect(less).not.toMatch(/^\s{2}overflow:\s*hidden/m);
  });
});
