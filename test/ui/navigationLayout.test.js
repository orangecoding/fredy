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
 * The three that are neither on the scale nor round are here because the specification puts them
 * in the stylesheet itself, and the stylesheet is inserted as written rather than rebuilt:
 *
 * - `6px`, the gap between entries, which the measurement table names in its own right. The scale
 *   jumps from 4 to 8 and the rail was drawn at neither.
 * - `-2px`, which pulls a group's children up against the entry they belong to, so the rail starts
 *   at the row above instead of a gap below it.
 * - `3px`, the side padding of the count badge on a narrow icon, where the scale's smallest step
 *   would make a two-digit badge wider than the cell holding it.
 */
const ALLOWED_SPACING = /^(0|auto|inherit|-?@space-\d+|-?@nav-[a-z-]+|1px|-2px|3px|6px|10px|14px|15px|19px|21px|40px)$/;

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

  it('keeps the two widths the plan names', () => {
    expect(less).toMatch(/@nav-wide:\s*248px/);
    expect(less).toMatch(/@nav-narrow:\s*64px/);
    expect(less).toMatch(/@nav-header:\s*64px/);
    expect(less).toMatch(/@nav-item:\s*40px/);
    expect(less).toMatch(/@nav-child:\s*34px/);
  });

  it('gives a selected entry one signal, not three', () => {
    const active = less.match(/&--active\s*\{[\s\S]*?\n {4}\}/);
    expect(active).not.toBeNull();
    expect(active[0]).toMatch(/background:\s*@color-elevated/);
    expect(active[0]).not.toMatch(/border/);
  });

  it('draws the marker at the size the plan names', () => {
    expect(less).toMatch(/&__marker\s*\{[\s\S]*?width:\s*2px/);
    expect(less).toMatch(/&__marker\s*\{[\s\S]*?height:\s*20px/);
  });

  it('ties the children to their parent with a rail', () => {
    expect(less).toMatch(/&__rail\s*\{[\s\S]*?left:\s*20px/);
    expect(less).toMatch(/&__children\s*\{[\s\S]*?padding-left:\s*21px/);
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
    expect(jsx).toMatch(/aria-expanded/);
  });
});
