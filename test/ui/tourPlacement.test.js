/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  CARD_GAP,
  SPOTLIGHT_PADDING,
  VIEWPORT_MARGIN,
  placeCard,
  sameRect,
  scrimPanels,
  spotlightRect,
} from '../../ui/src/services/tour/tourPlacement.js';

const VIEWPORT = { width: 1440, height: 900 };
const CARD = { width: 440, height: 260 };

/** Total area of a list of rectangles. */
const area = (rects) => rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);

describe('tour spotlight hole', () => {
  it('pads the element on every side', () => {
    expect(spotlightRect({ top: 100, left: 300, width: 200, height: 50 }, VIEWPORT)).toEqual({
      top: 100 - SPOTLIGHT_PADDING,
      left: 300 - SPOTLIGHT_PADDING,
      width: 200 + 2 * SPOTLIGHT_PADDING,
      height: 50 + 2 * SPOTLIGHT_PADDING,
    });
  });

  it('cuts a tall element to the part that is on screen, so there is still scrim to see', () => {
    const hole = spotlightRect({ top: -300, left: 270, width: 830, height: 2000 }, VIEWPORT);
    expect(hole.top).toBe(0);
    expect(hole.top + hole.height).toBe(VIEWPORT.height);
  });

  it('has nothing to show for an element that is missing, empty or scrolled away', () => {
    expect(spotlightRect(null, VIEWPORT)).toBeNull();
    expect(spotlightRect({ top: 10, left: 10, width: 0, height: 20 }, VIEWPORT)).toBeNull();
    expect(spotlightRect({ top: 2000, left: 10, width: 100, height: 20 }, VIEWPORT)).toBeNull();
  });
});

describe('tour scrim', () => {
  it('covers the whole window when a step points at nothing', () => {
    expect(scrimPanels(null, VIEWPORT)).toEqual([{ top: 0, left: 0, ...VIEWPORT }]);
  });

  it('covers everything but the hole, without overlapping itself', () => {
    const hole = { top: 110, left: 262, width: 1166, height: 134 };
    const panels = scrimPanels(hole, VIEWPORT);
    expect(panels).toHaveLength(4);
    expect(area(panels) + hole.width * hole.height).toBe(VIEWPORT.width * VIEWPORT.height);
    for (const panel of panels) {
      const overlapsHole =
        panel.left < hole.left + hole.width &&
        panel.left + panel.width > hole.left &&
        panel.top < hole.top + hole.height &&
        panel.top + panel.height > hole.top;
      expect(overlapsHole).toBe(false);
    }
  });
});

describe('tour card placement', () => {
  it('centres a step without a target', () => {
    const placement = placeCard(null, CARD, VIEWPORT);
    expect(placement).toMatchObject({ side: 'center', arrow: null });
    expect(placement.left).toBe((VIEWPORT.width - CARD.width) / 2);
  });

  it('prefers the space below the hole, lined up with its start edge', () => {
    const hole = { top: 110, left: 262, width: 1166, height: 134 };
    const placement = placeCard(hole, CARD, VIEWPORT);
    expect(placement).toMatchObject({ side: 'bottom', top: 110 + 134 + CARD_GAP, left: 262 });
  });

  it('goes above when there is no room below', () => {
    const hole = { top: 700, left: 300, width: 200, height: 100 };
    expect(placeCard(hole, CARD, VIEWPORT)).toMatchObject({ side: 'top', top: 700 - CARD_GAP - CARD.height });
  });

  it('slides along to stay on screen and keeps the arrow on the middle of a small target', () => {
    // The copy-application button, top right.
    const hole = { top: 26, left: 1234, width: 188, height: 54 };
    const placement = placeCard(hole, CARD, VIEWPORT);
    expect(placement.side).toBe('bottom');
    expect(placement.left + CARD.width).toBe(VIEWPORT.width - VIEWPORT_MARGIN);
    expect(placement.left + placement.arrow).toBe(hole.left + hole.width / 2);
  });

  it('sits beside a target that is too tall to go above or below', () => {
    const hole = { top: 80, left: 200, width: 300, height: 800 };
    expect(placeCard(hole, CARD, VIEWPORT).side).toBe('right');
    expect(placeCard({ ...hole, left: 900 }, CARD, VIEWPORT).side).toBe('left');
  });

  it('falls back to the corner, without an arrow, when a target leaves no room anywhere', () => {
    const hole = { top: 82, left: 266, width: 832, height: 800 };
    expect(placeCard(hole, CARD, VIEWPORT)).toEqual({
      top: VIEWPORT.height - CARD.height - VIEWPORT_MARGIN,
      left: VIEWPORT.width - CARD.width - VIEWPORT_MARGIN,
      side: 'corner',
      arrow: null,
    });
  });

  it('never puts the arrow on the rounded corner of the card', () => {
    const hole = { top: 100, left: 0, width: 10, height: 10 };
    const placement = placeCard(hole, CARD, VIEWPORT);
    expect(placement.arrow).toBeGreaterThanOrEqual(28);
  });
});

describe('rect comparison', () => {
  it('ignores sub-pixel jitter and tells real moves apart', () => {
    const rect = { top: 10, left: 10, width: 100, height: 50 };
    expect(sameRect(rect, { ...rect, top: 10.2 })).toBe(true);
    expect(sameRect(rect, { ...rect, top: 14 })).toBe(false);
    expect(sameRect(null, null)).toBe(true);
    expect(sameRect(rect, null)).toBe(false);
  });
});
