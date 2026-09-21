/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const detailDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../ui/src/views/listings');

/**
 * Reads one of the listing detail source files.
 *
 * Source text rather than a rendered tree, because this suite runs without a DOM. That makes these
 * assertions coarse, and they are written to be: each one guards a rule that is easy to break by
 * accident and impossible to see in a diff - one solid button on the page, the destructive pair
 * behind a menu, a label on every icon-only control.
 *
 * @param {string} relative
 * @returns {string}
 */
function source(relative) {
  return fs.readFileSync(path.join(detailDir, relative), 'utf-8');
}

const actionBar = source('components/ListingActionBar.jsx');
const detail = source('ListingDetail.jsx');
const workspace = source('components/ListingWorkspace.jsx');

describe('listing detail action hierarchy', () => {
  it('gives the page exactly one solid button, and it is the one the reader came for', () => {
    // Everything on this page used to be theme="light", which is how deleting a listing ended up
    // in the same register as writing to the landlord.
    const pages = [actionBar, detail, workspace];
    const solids = pages.flatMap((page) => [...page.matchAll(/theme="solid"/g)]);
    expect(solids).toHaveLength(1);

    const primary = actionBar.slice(actionBar.indexOf('listing-actionbar__primary'));
    expect(primary).toContain('theme="solid"');
    expect(primary).toContain('type="primary"');
    expect(primary).toContain("t('listing.application.action')");
  });

  it('keeps the two destructive actions behind the overflow menu', () => {
    const menu = actionBar.slice(actionBar.indexOf('const overflow'), actionBar.indexOf('return ('));
    expect(menu).toContain("t('listing.detail.delete')");
    expect(menu).toContain("t('listing.detail.reactivate')");

    // And nowhere else: a second delete button next to the menu entry is the failure this guards.
    expect([...actionBar.matchAll(/listing\.detail\.delete/g)]).toHaveLength(1);
    expect([...actionBar.matchAll(/listing\.detail\.reactivate/g)]).toHaveLength(1);
  });

  it('names every icon-only control for a screen reader', () => {
    // A tooltip is not a name: it needs a pointer, and it is not read out. Each of these controls
    // renders an icon and nothing else.
    for (const control of ['__watch', '__more']) {
      const at = actionBar.indexOf(`listing-actionbar${control}`);
      expect(at, control).toBeGreaterThan(-1);
      expect(actionBar.slice(at - 300, at + 300), control).toContain('aria-label');
    }
    const expand = detail.indexOf('listing-detail__image-expand');
    expect(detail.slice(expand, expand + 300)).toContain('aria-label');
  });

  it('states the watch button as a toggle rather than only colouring it', () => {
    expect(actionBar).toContain('aria-pressed');
  });

  it('moves the status out of the action bar, because a state is not a command', () => {
    expect(actionBar).not.toContain('StatusControl');
    expect(source('components/ListingTitleBlock.jsx')).toContain('StatusControl');
  });

  it('opens the ad with a real link, so the browser keeps its own ways of following one', () => {
    const at = actionBar.indexOf('listing-actionbar__open');
    const open = actionBar.slice(at - 300, at + 300);
    expect(open).toContain('target="_blank"');
    expect(open).toContain('rel="noopener noreferrer"');
  });
});

describe('listing detail headings', () => {
  it('has exactly one h1 on the page, and it is the listing title', () => {
    const titleBlock = source('components/ListingTitleBlock.jsx');
    expect([...titleBlock.matchAll(/<h1/g)]).toHaveLength(1);
    expect(titleBlock).toContain("listing?.title || t('listing.detail.defaultTitle')");

    for (const file of ['ListingDetail.jsx', 'components/ListingKeyFacts.jsx', 'components/ListingOrigin.jsx']) {
      expect([...source(file).matchAll(/<h1/g)], file).toHaveLength(0);
    }
  });

  it('gives every card an h2, rather than the h4 the sections used to be', () => {
    // The old page ran Title heading={4} for its sections, with no h2 or h3 above them, so the
    // outline a screen reader announced skipped two levels at the first section.
    for (const file of [
      'components/ListingKeyFacts.jsx',
      'components/ListingOrigin.jsx',
      'components/ListingLocationCard.jsx',
      'components/ListingWorkspace.jsx',
      'components/ListingDescriptionCard.jsx',
    ]) {
      expect([...source(file).matchAll(/<h2/g)].length, file).toBeGreaterThan(0);
    }
  });
});

describe('listing detail layout', () => {
  it('draws the map inside a card no ancestor of which may become a containing block', () => {
    // The map goes fullscreen by becoming `position: fixed`. A transform, filter or backdrop-filter
    // on anything above it pins that "fullscreen" inside the card instead.
    const stylesheets = ['ListingDetail.less', 'components/ListingLocationCard.less'];
    for (const file of stylesheets) {
      const text = source(file);
      expect(text, file).not.toMatch(/^\s*backdrop-filter:/m);
      expect(text, file).not.toMatch(/^\s*filter:/m);
    }

    // One transform is allowed, and only this one: it centres the pin-drop bar, which lives inside
    // the map shell and travels into fullscreen with it rather than containing it.
    const location = source('components/ListingLocationCard.less');
    const transforms = [...location.matchAll(/^\s*transform:/gm)];
    expect(transforms).toHaveLength(1);
    expect(location.slice(0, location.indexOf('transform:'))).toContain('__pin-bar');
  });

  it('puts the warning above everything a reader has to scroll past to reach it', () => {
    const scam = detail.indexOf('<ScamPanel');
    const bar = detail.indexOf('<ListingActionBar');
    const grid = detail.indexOf('listing-detail__grid');
    expect(scam).toBeGreaterThan(-1);
    expect(scam).toBeLessThan(bar);
    expect(bar).toBeLessThan(grid);
  });

  it('keeps the map and the control that redraws it in one card', () => {
    const location = source('components/ListingLocationCard.jsx');
    expect(location).toContain('MapCanvas');
    expect(location).toContain('TRAVEL_MODES');
    expect(location).toContain('lagecheckHref');
    expect(location).toContain('TravelTimes');

    // None of the four may drift back into the page container, which is how they ended up in
    // different columns in the first place.
    expect(detail).not.toContain('<MapCanvas');
    expect(detail).not.toContain('<TravelTimes');
  });
});
