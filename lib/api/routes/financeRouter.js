/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as listingStorage from '../../services/storage/listingsStorage.js';
import { isAdmin as isAdminFn } from '../security.js';
import logger from '../../services/logger.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import {
  computeBudget,
  isProfileComplete,
  isRentProfileComplete,
  maxAffordablePrice,
  scoreListing,
  scoreRentListing,
  thresholdsFor,
} from '../../services/finance/affordability.js';
import { DEAL_TYPES, dealTypeForPrice } from '../../services/dealType.js';
import { computeFinanceResult, validateProfile } from '../../services/finance/calculate.js';
import { normalizeProfile } from '../../services/finance/profile.js';
import { DEFAULT_PURCHASE_PRICE_THRESHOLD, num } from '../../services/finance/constants.js';
import { getUserSettings } from '../../services/storage/settingsStorage.js';

/** Upper bound for the affordability sweep, matching what the UI can usefully plot. */
const MAX_SCORED_LISTINGS = 1000;

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
/**
 * Everything the UI needs to know about a profile, in one payload.
 *
 * The frontend used to import the finance modules out of `lib/` and run all of this in the
 * browser. It cannot do that any more - it must not reach into server code - and copying the
 * modules instead would mean two implementations of the same arithmetic scoring the same
 * listings, where any drift shows up as a verdict chip contradicting the filter that found it.
 * So the math stays here, on one side of the wire, and the UI asks for the answers.
 *
 * Completeness is judged on the *raw* profile, exactly as the old client-side hook did:
 * normalizing first fills in equity, a Bundesland and default scenarios, which would make an
 * untouched profile look configured.
 *
 * @param {Object|null} rawProfile - The profile as stored or as currently drafted.
 * @returns {{isComplete: boolean, rentComplete: boolean, anyComplete: boolean,
 *   thresholds: {buy: Object|null, rent: Object|null}, budget: Object}}
 */
function summarizeProfile(rawProfile) {
  const profile = normalizeProfile(rawProfile);
  const isComplete = isProfileComplete(rawProfile);
  const rentComplete = isRentProfileComplete(rawProfile);
  return {
    isComplete,
    rentComplete,
    anyComplete: isComplete || rentComplete,
    thresholds: thresholdsFor(rawProfile),
    budget: computeBudget(profile),
    // The normalized profile is what the calculator seeds its form from. Normalizing is itself
    // rule-bearing (defaults for equity, Bundesland, scenarios), so it happens here too.
    profile,
  };
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function financePlugin(fastify) {
  /**
   * The stored profile's derived view: which halves are usable, the ceilings, the budget.
   *
   * Read on every page that shows a finance surface, so it is deliberately cheap - no listings
   * are touched, only the user's own settings row.
   */
  fastify.get('/profile-summary', async (request) => {
    const stored = getUserSettings(request.session.currentUser)?.finance_profile ?? null;
    return summarizeProfile(stored);
  });

  fastify.post('/calculate', async (request, reply) => {
    const profile = request.body?.profile ?? request.body ?? {};
    const error = validateProfile(normalizeProfile(profile));
    if (error) {
      return reply.code(400).send({ error });
    }

    try {
      // The calculator recomputes as the user types, and the panels around it need the budget,
      // the ceilings and the completeness flags for the same draft. Returning them together
      // keeps that one round trip instead of four.
      const payload = { result: computeFinanceResult(profile), ...summarizeProfile(profile) };
      await trackPoi(TRACKING_POIS.FINANCE_CALCULATOR_USED);
      return payload;
    } catch (err) {
      logger.error('Error while calculating financing', err);
      return reply.code(500).send({ error: err.message });
    }
  });

  /**
   * The financing breakdown for one listing, measured against the stored profile.
   *
   * Which arm applies follows the deal type of the job that found the listing: a rental is scored
   * against the rent ceilings, a purchase is run through the full amortization.
   */
  fastify.get('/listing/:listingId', async (request, reply) => {
    const { listingId } = request.params;
    const userId = request.session.currentUser;
    const listing = listingStorage.getListingById(listingId, userId, isAdminFn(request));
    if (listing == null) {
      return reply.code(404).send({ error: 'Listing not found' });
    }

    const stored = getUserSettings(userId)?.finance_profile ?? null;
    const summary = summarizeProfile(stored);
    const price = Number(listing.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { dealType: listing.dealType ?? null, scored: null, result: null, ...summary };
    }

    const dealType = listing.dealType ?? dealTypeForPrice(price, DEFAULT_PURCHASE_PRICE_THRESHOLD);
    try {
      if (dealType === DEAL_TYPES.RENT) {
        return {
          dealType,
          scored: summary.rentComplete ? scoreRentListing(listing, normalizeProfile(stored)) : null,
          result: null,
          ...summary,
        };
      }
      const profile = normalizeProfile(stored);
      return {
        dealType,
        scored: null,
        // The price of this listing replaces whatever purchase price the profile carries, so the
        // card answers "what would *this* property cost me" rather than repeating the calculator.
        result: summary.isComplete
          ? computeFinanceResult({ ...profile, financing: { ...profile.financing, purchasePrice: price } })
          : null,
        ...summary,
      };
    } catch (err) {
      logger.error('Error while computing the financing of a listing', err);
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.post('/affordability', async (request, reply) => {
    const body = request.body || {};
    // Completeness is judged on the raw profile, exactly as the UI hook does: normalizing first
    // fills in equity, a Bundesland and default scenarios, which would make a rent-only profile
    // look ready to score purchases. The normalized copy is only for the scoring math, where the
    // defaults are wanted (e.g. a Nebenkosten percentage).
    const rawProfile = body.profile;
    const profile = normalizeProfile(rawProfile);
    const error = validateProfile(profile);
    if (error) {
      return reply.code(400).send({ error });
    }
    const buyComplete = isProfileComplete(rawProfile);
    const rentComplete = isRentProfileComplete(rawProfile);
    // Either half is enough to score something: a household that only ever rents never fills in
    // equity or Grunderwerbsteuer, and should still get its rentals scored.
    if (!buyComplete && !rentComplete) {
      return reply.code(400).send({ error: 'The finance profile is incomplete.' });
    }

    const filter = body.filter || {};
    // Only reached for a listing whose job predates the deal type or lost it somehow: below the
    // threshold it is read as a monthly rent, above it as a purchase price.
    const threshold = Math.max(
      0,
      num(
        filter.purchasePriceThreshold,
        num(profile.financing.purchasePriceThreshold, DEFAULT_PURCHASE_PRICE_THRESHOLD),
      ),
    );

    try {
      // Reuse the normal listings query so this endpoint inherits the exact same user
      // scoping - a user can never score listings belonging to someone else.
      const { result: listings } = listingStorage.queryListings({
        page: 1,
        pageSize: MAX_SCORED_LISTINGS,
        jobIdFilter: nullIfEmpty(filter.jobId),
        watchListFilter: filter.watchListOnly === true ? true : null,
        minPrice: Number.isFinite(Number(filter.minPrice)) ? Number(filter.minPrice) : null,
        maxPrice: Number.isFinite(Number(filter.maxPrice)) ? Number(filter.maxPrice) : null,
        activityFilter: true,
        userId: request.session.currentUser,
        isAdmin: isAdminFn(request),
      });

      const skipped = { noPrice: 0, incompleteProfile: 0 };
      const items = [];

      for (const listing of listings) {
        const price = Number(listing.price);
        if (!Number.isFinite(price) || price <= 0) {
          skipped.noPrice++;
          continue;
        }
        // The job says what it was looking for. Only a job from before the deal type existed
        // falls back to reading the price itself.
        const dealType = listing.dealType ?? dealTypeForPrice(price, threshold);
        const isRental = dealType === DEAL_TYPES.RENT;
        if (isRental ? !rentComplete : !buyComplete) {
          skipped.incompleteProfile++;
          continue;
        }

        const scored = isRental
          ? scoreRentListing(listing, profile)
          : scoreListing(listing, profile, profile.financing);
        if (scored != null) {
          items.push({
            ...scored,
            dealType,
            provider: listing.provider ?? null,
            link: listing.link ?? null,
          });
        }
      }

      await trackPoi(TRACKING_POIS.FINANCE_AFFORDABILITY_SCAN);

      const budget = computeBudget(profile);
      const countOf = (predicate) => items.filter(predicate).length;
      const summaryFor = (dealType) => {
        const ofType = items.filter((item) => item.dealType === dealType);
        const affordable = ofType.filter((item) => item.verdict === 'affordable');
        return {
          total: ofType.length,
          affordable: affordable.length,
          stretch: ofType.filter((item) => item.verdict === 'stretch').length,
          unaffordable: ofType.filter((item) => item.verdict === 'unaffordable').length,
          cheapestAffordable: affordable.length > 0 ? Math.min(...affordable.map((item) => item.price)) : null,
        };
      };

      return {
        items,
        skipped,
        // Thresholds follow the raw profile too, so a rent-only profile reports no buy ceiling
        // (and the reverse), matching what the listings surfaces show.
        thresholds: thresholdsFor(rawProfile),
        summary: {
          total: items.length,
          affordable: countOf((item) => item.verdict === 'affordable'),
          stretch: countOf((item) => item.verdict === 'stretch'),
          unaffordable: countOf((item) => item.verdict === 'unaffordable'),
          maxAffordablePrice: buyComplete ? maxAffordablePrice(budget, profile.financing) : null,
          buy: summaryFor(DEAL_TYPES.BUY),
          rent: summaryFor(DEAL_TYPES.RENT),
        },
      };
    } catch (err) {
      logger.error('Error while scoring listings for affordability', err);
      return reply.code(500).send({ error: err.message });
    }
  });
}

/**
 * @param {*} value
 * @returns {string|null}
 */
function nullIfEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
