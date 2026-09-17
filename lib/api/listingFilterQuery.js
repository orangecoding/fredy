/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nullOrEmpty } from '../utils.js';
import { getJob } from '../services/storage/jobStorage.js';
import { getUserSettings } from '../services/storage/settingsStorage.js';
import { affordabilityBandFor } from '../services/finance/listingFilter.js';
import { filterMask, TECHNOLOGIES, OPERATOR_CODES } from '../services/connectivity/mobileBits.js';

/**
 * Turn a request's filter fields into the arguments `listingsStorage.queryListings` takes.
 *
 * Lives apart from the route because two endpoints read these same fields: the overview's `/table`
 * page and the bulk delete, which has to act on exactly the set the page is showing. The whole
 * point of the bulk delete is that the user can see what they are about to remove, and a second
 * copy of this normalisation is the one way that promise breaks.
 *
 * Everything that makes this block safe is here rather than at the call sites: the status and
 * travel-time whitelists, the mobile bitmask (built from names, never taken as a number), and the
 * affordability band, which is derived from the *stored* profile so a hand-edited request cannot
 * inject its own price bounds.
 *
 * @param {Object} source - `request.query` or `request.body`; only the filter fields are read.
 * @param {Object} context
 * @param {string|null} context.userId - The acting user, used for scoping and for the profile.
 * @param {boolean} [context.isAdmin=false]
 * @returns {{filters: Object, financeProfile: Object|null}} The filter object, plus the profile the
 *   band came from so a caller needing per-row verdicts does not read the settings row twice.
 */
export function normalizeListingFilters(source, { userId, isAdmin = false }) {
  const {
    activityFilter,
    jobNameFilter,
    providerFilter,
    watchListFilter,
    statusFilter,
    hiddenOnly,
    freeTextFilter,
    affordabilityFilter,
    travelTimeMode,
    travelTimeMaxMinutes,
    travelTimeLabel,
    connectivityMinDown,
    connectivityFiber,
    connectivityMobileTech,
    connectivityMobileOperator,
  } = source || {};

  const toBool = (v) => {
    if (v === true || v === 'true' || v === 1 || v === '1') return true;
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return null;
  };
  const normalizedActivity = toBool(activityFilter);
  const normalizedWatch = toBool(watchListFilter);
  const normalizedHidden = toBool(hiddenOnly) === true;
  const allowedStatuses = ['applied', 'rejected', 'accepted', 'none'];
  const normalizedStatus =
    typeof statusFilter === 'string' && allowedStatuses.includes(statusFilter.toLowerCase())
      ? statusFilter.toLowerCase()
      : undefined;

  let jobFilter = null;
  let jobIdFilter = null;
  if (!nullOrEmpty(jobNameFilter)) {
    const job = getJob(jobNameFilter);
    jobFilter = job != null ? job.name : null;
    jobIdFilter = job != null ? job.id : null;
  }

  // The mode and the ceiling come from the request, but only ever as a name and a number: the
  // whitelist that turns a mode into a column lives in the query itself, so nothing from here
  // reaches the SQL.
  const parsedMaxMinutes = Number.parseInt(String(travelTimeMaxMinutes), 10);
  const travelTimeFilter =
    ['transit', 'car', 'bike', 'walk'].includes(String(travelTimeMode).toLowerCase()) &&
    Number.isFinite(parsedMaxMinutes) &&
    parsedMaxMinutes > 0
      ? {
          mode: String(travelTimeMode).toLowerCase(),
          maxMinutes: parsedMaxMinutes,
          label: nullOrEmpty(travelTimeLabel) ? null : String(travelTimeLabel),
        }
      : null;

  // The connectivity filters. The downstream is a plain number and the fibre flag a boolean, but
  // the mobile pair is turned into a bitmask here rather than being passed through: which bit a
  // technology and operator map to is a decision for the code that wrote them, and a mask taken
  // from the query string would let a bookmarked URL ask about bits that mean something else.
  const parsedMinDown = Number.parseInt(String(connectivityMinDown), 10);
  const normalizedMinDown = Number.isFinite(parsedMinDown) && parsedMinDown > 0 ? parsedMinDown : null;
  const normalizedFiber = toBool(connectivityFiber) === true;
  const wantedTech = String(connectivityMobileTech ?? '').toLowerCase();
  const wantedOperator = String(connectivityMobileOperator ?? '').toLowerCase();
  const connectivityMobileMask = TECHNOLOGIES.includes(wantedTech)
    ? filterMask(wantedTech, OPERATOR_CODES.includes(wantedOperator) ? wantedOperator : null)
    : null;

  // Affordability is derived server-side from the user's stored profile, never from the
  // request, so a hand-edited or bookmarked URL cannot inject its own price bounds. An
  // incomplete profile yields no band at all, which means the filter is ignored rather than
  // returning an empty page.
  const financeProfile = getUserSettings(userId)?.finance_profile ?? null;
  const affordabilityBand = nullOrEmpty(affordabilityFilter)
    ? null
    : affordabilityBandFor(affordabilityFilter, financeProfile);

  return {
    financeProfile,
    filters: {
      freeTextFilter: freeTextFilter || null,
      activityFilter: normalizedActivity,
      jobNameFilter: jobFilter,
      jobIdFilter,
      providerFilter,
      watchListFilter: normalizedWatch,
      statusFilter: normalizedStatus,
      hiddenOnly: normalizedHidden,
      affordabilityBand,
      travelTimeFilter,
      connectivityMinDown: normalizedMinDown,
      connectivityFiberOnly: normalizedFiber,
      connectivityMobileMask,
      userId,
      isAdmin,
    },
  };
}
