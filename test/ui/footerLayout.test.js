/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

const less = read('ui/src/components/footer/FredyFooter.less');
const jsx = read('ui/src/components/footer/FredyFooter.jsx');
const app = read('ui/src/App.jsx');

/**
 * The stylesheet with its comments taken out.
 *
 * The comments name the tokens they argue against - the whole point of the note above `&__left` is
 * that the two lines used to wear `@color-faint` - so a check for a token has to read the
 * declarations rather than the prose about them.
 * @type {string}
 */
const declarations = less.replace(/\/\*[\s\S]*?\*\//g, '');

const ALLOWED_SPACING = /^(0|auto|inherit|@space-\d+|@footer-height|5px|6px|7px)$/;
const SPACING_PROPERTIES =
  /(^|\s)(gap|margin|margin-top|margin-right|margin-bottom|margin-left|padding|padding-top|padding-right|padding-bottom|padding-left)\s*:\s*([^;{}]+);/g;

describe('FredyFooter.less', () => {
  it('takes every spacing value from the scale', () => {
    const offenders = [];
    for (const match of declarations.matchAll(SPACING_PROPERTIES)) {
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

  it('no longer writes text in the token reserved for hairlines', () => {
    expect(declarations).not.toMatch(/@color-faint/);
  });

  it('keeps the bar at the height the plan names', () => {
    expect(less).toMatch(/@footer-height:\s*36px/);
  });

  it('spends colour on the dot and the border, never on the chip label', () => {
    const chip = declarations.match(/&__update\s*\{[\s\S]*?\n {2}\}/);
    expect(chip).not.toBeNull();
    expect(chip[0]).toMatch(/(^|[^-])color:\s*@color-text/);
    // `border-color: @color-orange-text` on :hover is the border doing its job, so the lookbehind
    // is what keeps this about the label rather than about any property ending in `color`.
    expect(chip[0]).not.toMatch(/(?<!-)color:\s*@color-orange-text/);
  });
});

describe('FredyFooter.jsx', () => {
  it('is a landmark, not a div from the component library', () => {
    expect(jsx).toMatch(/<footer/);
    expect(jsx).not.toMatch(/Layout\.Footer|const \{ Footer \}/);
  });

  it('draws the heart as a path, not as an emoji', () => {
    expect(jsx).toMatch(/fredyFooter__heart/);
    expect(jsx).not.toMatch(/❤/);
  });

  it('offers the release notes from the version number', () => {
    expect(jsx).toMatch(/VersionModal/);
    expect(jsx).toMatch(/newVersion/);
  });
});

describe('App.jsx', () => {
  it('no longer pushes every page down with a permanent update banner', () => {
    expect(app).not.toMatch(/VersionBanner/);
  });
});
