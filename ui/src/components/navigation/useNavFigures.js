/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router';

import { useActions, useSelector } from '../../services/state/store.js';

/** How long after a promised run the status is asked for again: the run itself takes a moment. */
export const STATUS_REFRESH_GRACE_MS = 60 * 1000;

/** `setTimeout` overflows past about 24.8 days and would fire at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Whether the run a status promises is overdue. That is the shape a stopped scheduler takes: the
 * time never moves again.
 *
 * @param {number} nextRun Epoch ms of the promised run.
 * @param {number} [now]
 * @returns {boolean}
 */
export function isRunOverdue(nextRun, now = Date.now()) {
  return nextRun + STATUS_REFRESH_GRACE_MS <= now;
}

/**
 * The counts beside the searches and the listings, wherever the navigation draws them.
 *
 * The jobs App fetches before the first render; the active listings come with the overview's
 * figures, see `useRunStatus`. Until they are in, an entry shows no number rather than a guess.
 *
 * @returns {Record<string, number|null>} By nav key.
 */
export function useNavCounts() {
  const jobCount = useSelector((state) => state.jobsData.jobs?.length ?? null);
  const listingCount = useSelector((state) => state.dashboard.data?.kpis?.numberOfActiveListings ?? null);
  return { '/jobs': jobCount, '/listings': listingCount };
}

/**
 * When the next search run is due, kept fresh from any page.
 *
 * Called by whichever navigation is on screen, the sidebar or the phone's app bar, and by nothing
 * else: each mounts once per layout, so the overview's figures are asked for once.
 *
 * Landing on any page but the overview left the count and the status out until the overview had
 * been opened once, so the navigation looked different depending on where the session began. Asked
 * once per mount - the navigation mounts again after every sign-in, so a figure left in the store by
 * the previous session is replaced - and not on the overview, which asks for the same answer.
 *
 * That answer goes stale the moment the promised run comes round, and nothing else refreshes it away
 * from the dashboard. Asked again once the run is due, plus a minute for the run itself: amber then
 * means a fresh answer still points into the past.
 *
 * @returns {number|null|undefined} Epoch ms of the next run. Until it is in there is nothing to draw:
 *   no placeholder, no dash, nothing that pretends to know.
 */
export function useRunStatus() {
  const location = useLocation();
  const actions = useActions();
  const nextRun = useSelector((state) => state.dashboard.data?.general?.nextRun);

  useEffect(() => {
    if (!location.pathname.startsWith('/dashboard')) actions.dashboard.getDashboard();
  }, []);

  useEffect(() => {
    if (nextRun == null || nextRun === 0) return undefined;
    const delay = Math.min(Math.max(0, nextRun - Date.now()) + STATUS_REFRESH_GRACE_MS, MAX_TIMER_MS);
    const timer = setTimeout(() => actions.dashboard.getDashboard(), delay);
    return () => clearTimeout(timer);
  }, [nextRun]);

  return nextRun;
}
