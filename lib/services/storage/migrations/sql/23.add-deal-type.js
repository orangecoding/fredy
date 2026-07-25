/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { DEAL_TYPES, detectDealTypeForJob, dealTypeForPrice } from '../../../dealType.js';
import { DEFAULT_PURCHASE_PRICE_THRESHOLD } from '../../../finance/constants.js';

/**
 * Migration: add `deal_type` to the `jobs` table.
 *
 * A job is either about renting or about buying. Everything financial hangs off that: the
 * affordability verdicts, the listings filter and which half of the finance profile applies.
 * From now on the user picks the type when creating a job, so this classification runs exactly
 * once - for the jobs that already exist.
 *
 * Three sources, in descending order of confidence:
 *   1. the provider search URLs (`wohnung-mieten` vs `marketingType=buy`, ...),
 *   2. the prices the job has already found - a median beyond any monthly rent means purchases,
 *   3. `rent`, the common case for Fredy, for a job that has neither.
 *
 * Every outcome is correctable in the job form, so a wrong guess costs one dropdown.
 */
export function up(db) {
  db.exec(`ALTER TABLE jobs ADD COLUMN deal_type TEXT`);

  const jobs = db.prepare(`SELECT id, provider FROM jobs`).all();
  const pricesOf = db.prepare(
    `SELECT price
     FROM listings
     WHERE job_id = ?
       AND price IS NOT NULL
       AND price > 0
     ORDER BY price`,
  );
  const setDealType = db.prepare(`UPDATE jobs SET deal_type = ? WHERE id = ?`);

  for (const job of jobs) {
    const dealType =
      detectDealTypeForJob(parseProvider(job.provider)) ??
      dealTypeForPrice(medianOf(pricesOf.all(job.id).map((row) => row.price)), DEFAULT_PURCHASE_PRICE_THRESHOLD) ??
      DEAL_TYPES.RENT;
    setDealType.run(dealType, job.id);
  }
}

/**
 * @param {string|null} json Raw `jobs.provider` column.
 * @returns {Array<{url?: string}>} Empty array for anything unparseable.
 */
function parseProvider(json) {
  if (json == null) {
    return [];
  }
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Median rather than average: a single outlier listing must not decide what a whole job is about.
 *
 * @param {number[]} sorted Prices in ascending order.
 * @returns {number|null} `null` for an empty list.
 */
function medianOf(sorted) {
  if (sorted.length === 0) {
    return null;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
