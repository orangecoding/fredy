/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';

import { sameRect } from '../../services/tour/tourPlacement.js';

/**
 * How many animation frames to keep looking for the element before giving up.
 *
 * About six seconds: the map and the listing detail wait on requests before their markup exists.
 * A step whose element never shows up still works, it just explains without pointing.
 */
const MAX_SEARCH_FRAMES = 360;

/** Space kept above an element the tour scrolls to, in px. */
const SCROLL_MARGIN_TOP = 110;

/**
 * Every element on the page that matches one of the selectors, in the selectors' order.
 *
 * @param {ReadonlyArray<string>} selectors
 * @returns {Element[]}
 */
function findAll(selectors) {
  return selectors.map((selector) => document.querySelector(selector)).filter((element) => element != null);
}

/**
 * The smallest box around all the elements.
 *
 * @param {Element[]} elements
 * @returns {{top: number, left: number, width: number, height: number}}
 */
function unionBox(elements) {
  const boxes = elements.map((element) => element.getBoundingClientRect());
  const top = Math.min(...boxes.map((box) => box.top));
  const left = Math.min(...boxes.map((box) => box.left));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  const right = Math.max(...boxes.map((box) => box.right));
  return { top, left, width: right - left, height: bottom - top };
}

/**
 * Follow the element a tour step is about, and scroll it into view whenever it changes.
 *
 * The selectors are looked up again on every frame rather than once: the page a step lands on renders
 * its content only when its data has arrived, and a sidebar group opens its entries only once it is
 * clicked or hovered. The spotlight covers every selector that matches, so while a group is open
 * both the group and the entry are in it. That matters in the narrow sidebar, where the entries are a
 * flyout that closes as soon as the pointer leaves the group: with only the entry lit, the group
 * would sit under the scrim and the flyout would close on the way to it.
 *
 * The box is measured on every frame as well, so the spotlight follows through scrolling, reflow and
 * resizing without listening to each of those separately. Nothing re-renders unless it moved.
 *
 * @param {ReadonlyArray<string>} selectors The preferred element first. Empty for a step without one.
 * @param {boolean} active Whether the app is on the step's page yet.
 * @returns {{top: number, left: number, width: number, height: number}|null} The box around the
 *   elements in viewport coordinates, or null while there is none.
 */
export function useTourTarget(selectors, active) {
  const [rect, setRect] = useState(null);
  const key = selectors.join('\n');

  useEffect(() => {
    setRect(null);
    if (!active || selectors.length === 0) {
      return undefined;
    }

    let frame = 0;
    let missing = 0;
    let current = null;
    let last = null;

    const tick = () => {
      const elements = findAll(selectors);
      if (elements.length === 0) {
        missing += 1;
        if (last != null) {
          last = null;
          setRect(null);
        }
        if (missing < MAX_SEARCH_FRAMES) {
          frame = requestAnimationFrame(tick);
        }
        return;
      }
      missing = 0;
      const [preferred] = elements;
      if (preferred !== current) {
        current = preferred;
        // A tall element (the job form, the map) is shown from its top: centring it would scroll the
        // part the step talks about out of view.
        const tall = preferred.getBoundingClientRect().height > window.innerHeight * 0.6;
        // Room above for the tour's status pill and for sticky bars such as the listing's action bar,
        // which would otherwise cover the top edge of a tall element scrolled to the top. Set for the
        // scroll only, and put back, so the page's own styling is left as it was.
        const previousMargin = preferred.style.scrollMarginTop;
        preferred.style.scrollMarginTop = `${SCROLL_MARGIN_TOP}px`;
        preferred.scrollIntoView?.({ block: tall ? 'start' : 'center', behavior: 'smooth' });
        preferred.style.scrollMarginTop = previousMargin;
      }
      const next = unionBox(elements);
      if (!sameRect(last, next)) {
        last = next;
        setRect(next);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key, active]);

  return rect;
}
