/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { mietspiegelEstimate } from './mietspiegel.js';
import { roughCommuteMinutes } from './commute.js';
import { lookupGreix } from './greixLookup.js';
import { calculateScores } from './scorer.js';
import { updateListingScoresByLink } from '../storage/listingsStorage.js';
import logger from '../logger.js';

/**
 * Enrich one stored listing with local signals and score it.
 *
 * Mirrors the backend pipeline's order (GREIX growth → isochrones seed → scores) minus
 * everything that needed the network or an LLM: no Nominatim (rows arrive geocoded or not
 * at all), no ORS (rough formula), no Gemini (risk legs stay 0, exactly like the backend's
 * hardcoded risk functions). Results land through the same guarded writer the old backend
 * used over HTTP, so a failed run keeps the last known scores via its zero-clobber rule.
 *
 * Kapitalzuwachs comes from GREIX house-price indices per region (2000-2025 CAGR), matched
 * by point-in-polygon over the listing coordinates. The legacy BRW columns stay frozen -
 * they are never written here, only superseded by greix_region/greix_cagr.
 *
 * @param {Object} listing Stored listing row (needs link, latitude, longitude, and
 *   living space as either `area` or `size` - stored rows carry `size`, the
 *   scorer-era fixtures carry `area`).
 * @returns {{investorScore: number, ownerScore: number}|null} Scores, or null without a link.
 */
export function enrichListing(listing) {
  const link = listing?.link;
  if (!link) return null;

  // Stored rows carry the living space as `size`; without this fallback every row scored
  // with the "area unknown" rent and dead cashflow/buy-rent legs (growth only).
  const area = listing.area ?? listing.size;
  const miete = mietspiegelEstimate(area);
  const commute = roughCommuteMinutes(listing.latitude, listing.longitude);
  const greix = lookupGreix(listing.latitude, listing.longitude);
  const { investorScore, ownerScore } = calculateScores({
    miete,
    area,
    price: listing.price,
    cagr: greix.cagr,
  });

  try {
    updateListingScoresByLink(link, {
      investor_score: investorScore,
      owner_score: ownerScore,
      asset_risk_score: 0,
      commute_minutes: commute,
      isochronen_miete: miete,
      greix_region: greix.region,
      greix_cagr: greix.cagr,
    });
  } catch (err) {
    logger.warn(`Local enrichment write-back failed for ${link}`, err);
  }
  return { investorScore, ownerScore };
}
