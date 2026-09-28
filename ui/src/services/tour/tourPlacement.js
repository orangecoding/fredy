/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Geometry of the onboarding tour's spotlight: where the hole in the blurred scrim goes, how the
 * scrim is cut around it, and where the step card sits next to it.
 *
 * Pure functions over plain rectangles, so the rules can be tested without a browser and the
 * component only has to measure and paint.
 */

/**
 * @typedef {Object} Rect
 * @property {number} top
 * @property {number} left
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} Size
 * @property {number} width
 * @property {number} height
 */

/** Air between the highlighted element and the edge of the hole, in px. */
export const SPOTLIGHT_PADDING = 8;

/** Distance between the hole and the card, in px. Leaves room for the arrow. */
export const CARD_GAP = 16;

/** How close the card may come to the edge of the window, in px. */
export const VIEWPORT_MARGIN = 16;

/** Closest the arrow may come to a corner of the card, in px, so it never sits on the radius. */
const ARROW_INSET = 28;

/**
 * The hole in the scrim for an element, padded and cut to what is actually on screen.
 *
 * A tall target (the job form, the map) reaches past the window, and a hole that does too would
 * leave nothing of the scrim above or below it. Cutting it to the viewport keeps the focus on the
 * part the user can see.
 *
 * @param {Rect|null|undefined} rect The element's bounding box in viewport coordinates.
 * @param {Size} viewport
 * @param {number} [padding=SPOTLIGHT_PADDING]
 * @returns {Rect|null} Null when there is nothing to highlight or none of it is on screen.
 */
export function spotlightRect(rect, viewport, padding = SPOTLIGHT_PADDING) {
  if (rect == null || !(rect.width > 0) || !(rect.height > 0)) {
    return null;
  }
  const left = Math.max(0, rect.left - padding);
  const top = Math.max(0, rect.top - padding);
  const right = Math.min(viewport.width, rect.left + rect.width + padding);
  const bottom = Math.min(viewport.height, rect.top + rect.height + padding);
  if (right <= left || bottom <= top) {
    return null;
  }
  return { top, left, width: right - left, height: bottom - top };
}

/**
 * The scrim as four panels around the hole: a full-width band above and below, and one on each
 * side of it.
 *
 * Four panels rather than one sheet with a hole cut out, because `backdrop-filter` blurs whatever
 * is behind the whole element and a mask cannot exempt part of it reliably across browsers. With
 * the panels the target is simply not behind any of them, so it stays sharp and clickable.
 *
 * @param {Rect|null} hole
 * @param {Size} viewport
 * @returns {Rect[]} One panel covering everything when there is no hole, four otherwise.
 */
export function scrimPanels(hole, viewport) {
  const { width, height } = viewport;
  if (hole == null) {
    return [{ top: 0, left: 0, width, height }];
  }
  const bottom = hole.top + hole.height;
  const right = hole.left + hole.width;
  return [
    { top: 0, left: 0, width, height: hole.top },
    { top: bottom, left: 0, width, height: Math.max(0, height - bottom) },
    { top: hole.top, left: 0, width: hole.left, height: hole.height },
    { top: hole.top, left: right, width: Math.max(0, width - right), height: hole.height },
  ];
}

/**
 * Clamp a value into a range whose bounds may have crossed, in which case the lower one wins.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

/**
 * @typedef {Object} CardPlacement
 * @property {number} top
 * @property {number} left
 * @property {'bottom'|'top'|'right'|'left'|'center'|'corner'} side Where the card sits relative to
 *   the hole. `center` is a step without a target, `corner` a target too big to sit beside.
 * @property {number|null} arrow Offset of the arrow along the card's edge facing the hole, in px,
 *   or null when the card has no arrow.
 */

/**
 * Where the step card goes.
 *
 * Below the hole if it fits, then above, then to the right, then to the left - the order a reader
 * looks for an explanation in. The card lines up with the hole's start edge and slides along to
 * stay on screen, and the arrow slides the other way so it keeps pointing at the hole's middle.
 * A target that leaves no room on any side (the map, a long form) gets the card in the bottom
 * right corner, over the target, without an arrow.
 *
 * @param {Rect|null} hole
 * @param {Size} card
 * @param {Size} viewport
 * @param {Object} [options]
 * @param {number} [options.gap=CARD_GAP]
 * @param {number} [options.margin=VIEWPORT_MARGIN]
 * @returns {CardPlacement}
 */
export function placeCard(hole, card, viewport, { gap = CARD_GAP, margin = VIEWPORT_MARGIN } = {}) {
  const maxLeft = viewport.width - card.width - margin;
  const maxTop = viewport.height - card.height - margin;

  if (hole == null) {
    return {
      top: clamp((viewport.height - card.height) / 2, margin, maxTop),
      left: clamp((viewport.width - card.width) / 2, margin, maxLeft),
      side: 'center',
      arrow: null,
    };
  }

  const holeRight = hole.left + hole.width;
  const holeBottom = hole.top + hole.height;
  const alongX = () => {
    const left = clamp(hole.left, margin, maxLeft);
    const arrow = clamp(hole.left + hole.width / 2 - left, ARROW_INSET, card.width - ARROW_INSET);
    return { left, arrow };
  };
  const alongY = () => {
    const top = clamp(hole.top, margin, maxTop);
    const arrow = clamp(hole.top + hole.height / 2 - top, ARROW_INSET, card.height - ARROW_INSET);
    return { top, arrow };
  };

  if (viewport.height - holeBottom - gap - margin >= card.height) {
    return { top: holeBottom + gap, ...alongX(), side: 'bottom' };
  }
  if (hole.top - gap - margin >= card.height) {
    return { top: hole.top - gap - card.height, ...alongX(), side: 'top' };
  }
  if (viewport.width - holeRight - gap - margin >= card.width) {
    return { left: holeRight + gap, ...alongY(), side: 'right' };
  }
  if (hole.left - gap - margin >= card.width) {
    return { left: hole.left - gap - card.width, ...alongY(), side: 'left' };
  }
  return { top: Math.max(margin, maxTop), left: Math.max(margin, maxLeft), side: 'corner', arrow: null };
}

/**
 * Whether two rectangles are the same to the pixel. Used to skip a re-render when a measurement
 * taken on the next animation frame found nothing moved.
 *
 * @param {Rect|null} a
 * @param {Rect|null} b
 * @returns {boolean}
 */
export function sameRect(a, b) {
  if (a == null || b == null) {
    return a === b;
  }
  return (
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
}
