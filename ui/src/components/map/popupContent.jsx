/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../../services/i18n/i18n.jsx';

/**
 * Renders a React node into a MapLibre popup.
 *
 * Popup content lives outside the app's React tree, so it gets no context from it - the translation
 * provider has to be re-established here, which is why the caller passes the active language.
 *
 * @param {HTMLElement} container - The element inside the popup to render into.
 * @param {React.ReactNode} node
 * @param {string} language - Active language code, e.g. `de`.
 * @returns {() => void} Unmounts the tree again. Safe to call from a MapLibre event handler: the
 * unmount is deferred, because React refuses to tear a root down while it is rendering.
 */
export function mountPopupNode(container, node, language) {
  const root = createRoot(container);
  root.render(<I18nProvider language={language}>{node}</I18nProvider>);

  return () => {
    setTimeout(() => root.unmount(), 0);
  };
}

/** Gap kept between a popup and the edge of the map. */
const POPUP_VIEWPORT_PADDING = 12;

/** When to check the fit again, in milliseconds after opening, for content that loads late. */
const REFIT_DELAYS = [120, 400, 1000, 2000];

/**
 * Pans the map until the popup fits into it.
 *
 * MapLibre places a popup relative to its marker and lets it hang off the map, which for the taller
 * listing popups means half of one is cut off at the bottom. The popup also grows after it opened -
 * the nearby stops arrive later - so this keeps watching its size for as long as it is open.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {import('maplibre-gl').Popup} popup
 * @returns {() => void} Stops watching. Called automatically when the popup closes.
 */
export function keepPopupInView(map, popup) {
  const fit = () => {
    const element = popup.getElement();
    if (!element || !map.getContainer()) return;

    const view = map.getContainer().getBoundingClientRect();
    const box = element.getBoundingClientRect();

    // Positive values move the map content the other way, which is what panBy expects.
    let x = 0;
    let y = 0;
    if (box.bottom > view.bottom - POPUP_VIEWPORT_PADDING) y = box.bottom - (view.bottom - POPUP_VIEWPORT_PADDING);
    if (box.top - y < view.top + POPUP_VIEWPORT_PADDING) y = box.top - (view.top + POPUP_VIEWPORT_PADDING);
    if (box.right > view.right - POPUP_VIEWPORT_PADDING) x = box.right - (view.right - POPUP_VIEWPORT_PADDING);
    if (box.left - x < view.left + POPUP_VIEWPORT_PADDING) x = box.left - (view.left + POPUP_VIEWPORT_PADDING);

    if (x !== 0 || y !== 0) {
      map.panBy([x, y], { duration: 200 });
    }
  };

  fit();

  // The popup grows after it opened: the departure board and the nearby stops are fetched. A
  // ResizeObserver is the obvious tool, but it is not delivered everywhere, so the fit is simply
  // repeated over the window in which that content can realistically arrive.
  const timers = REFIT_DELAYS.map((delay) => setTimeout(fit, delay));

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
  const element = popup.getElement();
  if (observer && element) {
    observer.observe(element);
  }

  const stop = () => {
    timers.forEach(clearTimeout);
    observer?.disconnect();
  };
  popup.on('close', stop);

  return stop;
}
