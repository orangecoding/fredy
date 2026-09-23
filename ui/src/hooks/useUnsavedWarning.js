/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect } from 'react';

/**
 * Asks before the page is left with unsaved changes.
 *
 * Covers a reload, a closed tab and a typed address, which is what `beforeunload` is. It does *not*
 * cover switching to another settings tab, and that is a limitation rather than an oversight:
 * react-router's `useBlocker` is the tool for an in-app navigation and it only works inside a data
 * router. `ui/src/Index.jsx` mounts `<HashRouter>`, the component API, where calling it throws.
 * Moving the app to `createHashRouter` plus `RouterProvider` would fix it and is a routing change,
 * not a settings change.
 *
 * Until then the sticky save bar is what makes an unsaved state impossible to miss.
 *
 * The browser decides the wording. Every current one ignores whatever string is returned and shows
 * its own; `preventDefault()` plus a non-empty `returnValue` is the whole contract.
 *
 * @param {boolean} dirty
 * @returns {void}
 */
export function useUnsavedWarning(dirty) {
  useEffect(() => {
    if (!dirty) {
      return undefined;
    }

    const handler = (event) => {
      event.preventDefault();
      // Legacy, and still required by some browsers to trigger the prompt at all.
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
