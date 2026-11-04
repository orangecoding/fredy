/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const uiSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../ui/src');
const read = (file) => fs.readFileSync(path.join(uiSrc, file), 'utf8');

/**
 * The z-index a stylesheet declares for one rule. A rule is found by its selector at the start of a line, so
 * a selector that merely appears inside another one (`&--wide &__ui {`) is not mistaken for it, and the
 * indentation tells a top-level rule (column 0) from one nested in a block or a media query.
 *
 * @param {string} less The stylesheet.
 * @param {string} selector The rule's selector, as written (`&__ui`, `.maplibregl-popup`).
 * @param {{topLevel?: boolean}} [options] `topLevel`: the rule must not be nested in anything.
 * @returns {number}
 */
function zIndexOf(less, selector, { topLevel = false } = {}) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`^${topLevel ? '' : '[ \\t]+'}${escaped} \\{`, 'm').exec(less);
  if (!found) throw new Error(`no ${topLevel ? 'top-level ' : ''}rule "${selector}"`);
  const body = less.slice(found.index, less.indexOf('}', found.index));
  const match = /z-index:\s*(\d+)/.exec(body);
  if (!match) throw new Error(`rule "${selector}" has no z-index`);
  return Number(match[1]);
}

/*
 * On a short phone screen a listing popup is nearly as large as the map, so it ends up under the panels laid
 * over the map (search, style and filter column). What is under them is drawn but takes no taps: the pager
 * arrows and the close button were unreachable. The panels cannot move out of the way, so the popup lies above
 * them.
 *
 * This reads the stylesheet, as other tests here do, so it pins that the rule is declared and ordered - not that
 * it takes effect: that needs a browser (verified by hand in a viewport 390 wide and 809 high, where a real click
 * on the pager arrow reaches "2 / 2" only with the rule).
 */
describe('map popup layering', () => {
  const panels = read('components/map/Map.less');
  const popup = () => zIndexOf(panels, '.maplibregl-popup', { topLevel: true });

  it('declares a z-index for MapLibre popups above the search box', () => {
    expect(popup()).toBeGreaterThan(zIndexOf(panels, '&__search'));
  });

  it('declares a z-index for MapLibre popups above the panel column', () => {
    expect(popup()).toBeGreaterThan(zIndexOf(panels, '&__ui'));
  });

  it('keeps those z-indexes inside the map by isolating the shell', () => {
    // Without a stacking context on .map-shell the popup's 20 competes with the whole page and lands
    // above the listing detail's action bar (20) and the job form's save bar (5).
    const found = /^\.map-shell \{/m.exec(panels);
    expect(found).not.toBeNull();
    const body = panels.slice(found.index, panels.indexOf('\n}', found.index));
    expect(body).toMatch(/^ {2}isolation:\s*isolate;/m);
  });
});
