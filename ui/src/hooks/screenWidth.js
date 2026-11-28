/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect } from 'react';

/**
 * Below this width a view lays itself out for a phone: the listing detail moves its action bar to
 * the bottom edge and folds its secondary cards shut, and the map folds its panel behind its heading.
 * One number for both, so "on a phone" means the same screen wherever it is asked.
 */
export const PHONE_BREAKPOINT = 768;

export function useScreenWidth() {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    let timeoutId;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setWidth(window.innerWidth), 100);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return width;
}

/**
 * Whether the window is a phone's: narrower than `PHONE_BREAKPOINT`, the same test the listing
 * detail and the map make.
 *
 * Decides which shell the app renders - the sidebar, or the app bar with a tab bar along the bottom -
 * so it follows rotation and resizing like `useScreenWidth` does.
 *
 * @returns {boolean}
 */
export function useIsPhone() {
  return useScreenWidth() < PHONE_BREAKPOINT;
}
