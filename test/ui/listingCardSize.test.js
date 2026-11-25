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

/**
 * A source file with its comments taken out, so an assertion about what must not appear cannot be
 * failed by a comment that explains why it went.
 *
 * @param {string} text
 * @returns {string}
 */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const grid = code(read('ui/src/components/grid/listings/ListingsGrid.jsx'));
const less = code(read('ui/src/components/grid/listings/ListingsGrid.less'));
const dashboard = code(read('ui/src/views/dashboard/components/LatestListings.jsx'));
const dashboardLess = code(read('ui/src/views/dashboard/Dashboard.less'));

/**
 * One BEM element block (`&__name { ... }`) of a stylesheet, up to its closing brace.
 *
 * @param {string} text The stylesheet, comments taken out.
 * @param {string} element The element name after `&__`.
 * @returns {string}
 */
const block = (text, element) => text.match(new RegExp(`&__${element} \\{[\\s\\S]*?\\n {2}\\}`))?.[0] ?? '';

describe('the living space on a listing card (#538)', () => {
  it('is no longer part of the address line', () => {
    const whereLine = grid.match(/function whereLine\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(whereLine).toMatch(/item\.address/);
    expect(whereLine).not.toMatch(/item\.size/);
    expect(whereLine).not.toMatch(/m²/);
  });

  it('closes the price row as a pill, and only when the size is known', () => {
    const row = grid.match(/<div className="listingsGrid__card__price">[\s\S]*?\n {16}<\/div>/)?.[0] ?? '';
    expect(row).toMatch(
      /<PriceChangeBadge[\s\S]*?\/>\s*\{item\.size != null && \(\s*<span className="listingsGrid__card__size">\{formatDecimal\(item\.size, locale\)\} m²<\/span>/,
    );
  });

  it('keeps the price row for a listing that states a size but no price', () => {
    expect(grid).toMatch(
      /\{\(item\.price \|\| item\.size != null\) && \(\s*<div className="listingsGrid__card__price">/,
    );
    expect(grid).toMatch(/\{item\.price && \(\s*<span className="listingsGrid__card__amount">/);
  });

  it('sits at the right end of the row and never breaks inside', () => {
    const size = block(less, 'size');
    expect(size).toMatch(/margin-left: auto;/);
    expect(size).toMatch(/white-space: nowrap;/);
    expect(size).toMatch(/border: 1px solid @color-border-bright;/);
    expect(size).toMatch(/border-radius: @radius-pill;/);
  });

  it('lets the price row wrap, so price, badges and pill fit a 375 px card', () => {
    expect(block(less, 'price')).toMatch(/flex-wrap: wrap;/);
  });
});

describe('the address line on a listing card (#538)', () => {
  it('wraps instead of ending in an ellipsis', () => {
    const meta = block(less, 'meta');
    expect(meta).not.toBe('');
    expect(meta).not.toMatch(/white-space: nowrap;/);
    expect(meta).not.toMatch(/text-overflow: ellipsis;/);
    expect(meta).toMatch(/overflow-wrap: anywhere;/);
  });
});

describe('the newest listings on the dashboard follow the listing cards (#538)', () => {
  it('leaves the living space out of the meta line', () => {
    const metaLine = dashboard.match(/function metaLine\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(metaLine).toMatch(/row\.address/);
    expect(metaLine).not.toMatch(/row\.size/);
    expect(metaLine).not.toMatch(/m²/);
  });

  it('closes the price row with the size pill, and only when the size is known', () => {
    expect(dashboard).toMatch(
      /<span className="dashboard__listingPrice">[\s\S]*?\{row\.size != null && \(\s*<span className="dashboard__listingSize">\{formatDecimal\(row\.size, locale\)\} m²<\/span>/,
    );
  });

  it('draws the pill like the one on the listing cards', () => {
    const declarations = (text) => text.replace(/^[^{]*\{/, '').trim();
    expect(declarations(block(dashboardLess, 'listingSize'))).toBe(declarations(block(less, 'size')));
  });

  it('lets the price row wrap and the meta line wrap, while the title keeps its ellipsis', () => {
    expect(block(dashboardLess, 'listingPrice')).toMatch(/flex-wrap: wrap;/);
    const meta = block(dashboardLess, 'listingMeta');
    expect(meta).not.toBe('');
    expect(meta).not.toMatch(/white-space: nowrap;/);
    expect(meta).not.toMatch(/text-overflow: ellipsis;/);
    expect(meta).toMatch(/overflow-wrap: anywhere;/);
    expect(block(dashboardLess, 'listingTitle')).toMatch(/text-overflow: ellipsis;/);
  });
});
