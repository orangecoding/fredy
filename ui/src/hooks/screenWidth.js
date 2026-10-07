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
