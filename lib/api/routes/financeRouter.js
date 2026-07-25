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

/** Upper bound for the affordability sweep, matching what the UI can usefully plot. */
const MAX_SCORED_LISTINGS = 1000;

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function financePlugin(fastify) {
  fastify.post('/calculate', async (request, reply) => {
    const profile = request.body?.profile ?? request.body ?? {};
    const error = validateProfile(normalizeProfile(profile));
    if (error) {
      return reply.code(400).send({ error });
    }

    try {
      const result = computeFinanceResult(profile);
      await trackPoi(TRACKING_POIS.FINANCE_CALCULATOR_USED);
      return result;
    } catch (err) {
      logger.error('Error while calculating financing', err);
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
