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
 * What the navigation shows besides the places: the two counts and whether Fredy is still running.
 *
 * Shared by the sidebar and the phone's app bar and tab bar. Only one of the two is mounted at a
 * time, so the requests below go out once whichever shell is on screen.
 *
 * @typedef {Object} NavStatus
 * @property {Record<string, number|null>} counts Keyed by nav key: the jobs and the active listings.
 * @property {number|null} nextRun Epoch ms of the next run, or `null` until the answer is in.
 * @property {boolean} stale The promised run is more than a grace period in the past, which is the
 *   shape a stopped scheduler takes: the time never moves again.
 */

/**
 * Read the navigation's status, and keep it fresh.
 *
 * @returns {NavStatus}
 */
export function useNavStatus() {
  const location = useLocation();
  const actions = useActions();

  // The counts beside two entries. The jobs App fetches before the first render; the active listings
  // come with the overview's figures, which the navigation asks for itself (below) when someone lands
  // on another page first. Until they are in, the listings entry shows no number rather than a guess.
  const jobCount = useSelector((state) => state.jobsData.jobs?.length ?? null);
  const listingCount = useSelector((state) => state.dashboard.data?.kpis?.numberOfActiveListings ?? null);

  // The next run, from the same answer. Until it is in, nothing is drawn - no placeholder, no dash,
  // nothing that pretends to know. Once there is one, the navigation asks again when it falls due.
  const nextRun = useSelector((state) => state.dashboard.data?.general?.nextRun);

  // Landing on any page but the overview left the count and the status out until the overview had
  // been opened once, so the navigation looked different depending on where the session began. Asked
  // once per mount - the navigation mounts again after every sign-in, so a figure left in the store
  // by the previous session is replaced - and not on the overview, which asks for the same answer.
  useEffect(() => {
    if (!location.pathname.startsWith('/dashboard')) actions.dashboard.getDashboard();
  }, []);

  // That answer goes stale the moment the promised run comes round, and nothing else refreshes it
  // away from the dashboard. Asked again once the run is due, plus a minute for the run itself:
  // amber then means a fresh answer still points into the past.
  useEffect(() => {
    if (nextRun == null || nextRun === 0) return undefined;
    const delay = Math.min(Math.max(0, nextRun - Date.now()) + STATUS_REFRESH_GRACE_MS, MAX_TIMER_MS);
    const timer = setTimeout(() => actions.dashboard.getDashboard(), delay);
    return () => clearTimeout(timer);
  }, [nextRun]);

  const known = nextRun != null && nextRun !== 0;
  return {
    counts: { '/jobs': jobCount, '/listings': listingCount },
    nextRun: known ? nextRun : null,
    stale: known && nextRun + STATUS_REFRESH_GRACE_MS <= Date.now(),
  };
}
