/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';

/** Class put on the element the current tour step is about. Styled in `OnboardingTour.less`. */
export const TOUR_HIGHLIGHT_CLASS = 'onboardingTour-target';

/** How often to look for the element while its page is still rendering, in ms. */
const POLL_INTERVAL_MS = 150;

/**
 * How many times to look before giving up.
 *
 * About six seconds: the map and the listing detail wait on requests before their markup exists.
 * A step whose element never shows up still works, it just explains without pointing.
 */
const MAX_ATTEMPTS = 40;

/**
 * Highlight the element a tour step is about, and scroll it into view.
 *
 * The element is looked for repeatedly rather than once, because the tour navigates first and the
 * page it lands on renders its content only when its data has arrived. The class is removed again
 * when the step changes or the tour ends.
 *
 * @param {string|null} selector CSS selector of the element, or null for a step without one.
 * @param {boolean} active Whether the app is on the step's page yet.
 * @returns {boolean} Whether the element was found and highlighted.
 */
export function useTourHighlight(selector, active) {
  const [found, setFound] = useState(false);

  useEffect(() => {
    setFound(false);
    if (!active || !selector) {
      return undefined;
    }

    let element = null;
    let attempts = 0;
    let timer = null;

    const look = () => {
      element = document.querySelector(selector);
      if (element != null) {
        element.classList.add(TOUR_HIGHLIGHT_CLASS);
        // A tall element (the job form, the map) is shown from its top: centring it would scroll
        // the part the step talks about out of view.
        const tall = element.getBoundingClientRect().height > window.innerHeight * 0.6;
        element.scrollIntoView?.({ block: tall ? 'start' : 'center', behavior: 'smooth' });
        setFound(true);
        return;
      }
      attempts += 1;
      if (attempts < MAX_ATTEMPTS) {
        timer = setTimeout(look, POLL_INTERVAL_MS);
      }
    };

    look();

    return () => {
      clearTimeout(timer);
      element?.classList.remove(TOUR_HIGHLIGHT_CLASS);
    };
  }, [selector, active]);

  return found;
}
