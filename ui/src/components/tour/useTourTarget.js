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

/**
 * Follow the element a tour step is about, and scroll it into view once found.
 *
 * The element is looked for on every frame rather than once, because the tour navigates first and
 * the page it lands on renders its content only when its data has arrived. Once found, its box is
 * measured on every frame as well, so the spotlight follows it through scrolling, reflow and
 * resizing without listening to each of those separately. Nothing re-renders unless it moved.
 *
 * @param {string|null} selector CSS selector of the element, or null for a step without one.
 * @param {boolean} active Whether the app is on the step's page yet.
 * @returns {{top: number, left: number, width: number, height: number}|null} The element's box in
 *   viewport coordinates, or null while there is none.
 */
export function useTourTarget(selector, active) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    setRect(null);
    if (!active || !selector) {
      return undefined;
    }

    let frame = 0;
    let searched = 0;
    let element = null;
    let last = null;

    const tick = () => {
      if (element == null || !element.isConnected) {
        element = document.querySelector(selector);
        if (element == null) {
          searched += 1;
          if (searched < MAX_SEARCH_FRAMES) {
            frame = requestAnimationFrame(tick);
          }
          return;
        }
        // A tall element (the job form, the map) is shown from its top: centring it would scroll the
        // part the step talks about out of view.
        const tall = element.getBoundingClientRect().height > window.innerHeight * 0.6;
        element.scrollIntoView?.({ block: tall ? 'start' : 'center', behavior: 'smooth' });
      }
      const box = element.getBoundingClientRect();
      const next = { top: box.top, left: box.left, width: box.width, height: box.height };
      if (!sameRect(last, next)) {
        last = next;
        setRect(next);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [selector, active]);

  return rect;
}
