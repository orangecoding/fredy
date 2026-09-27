/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { xhrGet, xhrPost } from '../xhr.js';

/**
 * The browser's half of the onboarding tour: asking the server where the tour stands, and telling
 * it when the tour starts and ends. The server owns the example data; everything here only moves
 * the tour between its states.
 */

/** Endpoint every way of ending the tour goes through, the unload beacon included. */
export const TOUR_FINISH_URL = '/api/tour/finish';

/**
 * How a tour can end.
 *
 * @type {Readonly<{COMPLETED: 'completed', CANCELLED: 'cancelled'}>}
 */
export const TOUR_OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

/** The status the server reports for a tour in progress. */
export const TOUR_STATUS_RUNNING = 'running';

/**
 * @typedef {Object} TourState
 * @property {string|null} status Null when the tour was never offered.
 * @property {boolean} offer Whether to ask the user whether they want the tour.
 * @property {string|null} jobId Id of the example job while the tour runs.
 * @property {string|null} listingId Id of the example listing while the tour runs.
 */

/**
 * @returns {Promise<TourState>}
 */
export async function fetchTourState() {
  const response = await xhrGet('/api/tour');
  return response.json;
}

/**
 * Accept the tour. Resolves once the example data is in place.
 *
 * @returns {Promise<{jobId: string, listingId: string|null}>}
 */
export async function startTour() {
  const response = await xhrPost('/api/tour/start');
  return response.json;
}

/**
 * Decline the tour, so it is not offered again.
 *
 * @returns {Promise<void>}
 */
export async function declineTour() {
  await xhrPost('/api/tour/decline');
}

/**
 * End the tour and have its example data removed.
 *
 * @param {'completed'|'cancelled'} outcome
 * @returns {Promise<void>}
 */
export async function finishTour(outcome) {
  await xhrPost(TOUR_FINISH_URL, { outcome });
}

/**
 * Cancel the tour from a page that is going away.
 *
 * An ordinary request started while the page unloads is cancelled with it, so this goes out as a
 * beacon, which the browser delivers after the page is gone. It carries the session cookie like any
 * same-origin request. If the browser refuses the beacon, the server's cleanup cron removes the
 * example data once the tour has outlived its time.
 *
 * @param {Navigator|undefined} [nav=globalThis.navigator]
 * @returns {boolean} Whether the browser accepted the beacon.
 */
export function sendTourCancelBeacon(nav = globalThis.navigator) {
  if (typeof nav?.sendBeacon !== 'function') {
    return false;
  }
  const body = new Blob([JSON.stringify({ outcome: TOUR_OUTCOME.CANCELLED })], { type: 'application/json' });
  try {
    return nav.sendBeacon(TOUR_FINISH_URL, body);
  } catch {
    return false;
  }
}
