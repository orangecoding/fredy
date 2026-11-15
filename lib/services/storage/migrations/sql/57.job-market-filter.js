/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { computeBenchmark } from '../../../listings/marketBenchmark.js';
import { DEAL_TYPES } from '../../../dealType.js';

/**
 * What a job expects of the market around a listing, and what the rent around a purchase is.
 *
 * Three additions that belong together:
 *
 * - `jobs.market_filter` holds how far below the local median a listing has to be, what gross yield
 *   a purchase has to promise, and what happens to a listing that misses either. Its own column for
 *   the reason the commute filter has one: it can only be judged at the very end of the pipeline,
 *   once the benchmark exists. Shape, as JSON:
 *
 *   ```json
 *   { "action": "notify", "minBelowMarketPercent": 10, "minYieldPercent": 4 }
 *   ```
 *
 * - `jobs.price_change_threshold` overrides the instance-wide smallest price change worth a
 *   notification. NULL means the instance value applies, so no existing job changes.
 *
 * - `listings.rent_median_sqm` and its two companions are the benchmark a purchase is missing: what
 *   a square metre rents for around it. The yield is the quotient of that and the listing's own price
 *   per square metre, so it is derived on read rather than stored a second time.
 *
 * The backfill measures every purchase already stored, the same one-off catch-up migration 41 did for
 * the median itself.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columnsOf = (table) =>
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((column) => column.name);

  const jobColumns = columnsOf('jobs');
  if (!jobColumns.includes('market_filter')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN market_filter TEXT`);
  }
  if (!jobColumns.includes('price_change_threshold')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN price_change_threshold REAL`);
  }

  const listingColumns = columnsOf('listings');
  if (!listingColumns.includes('rent_median_sqm')) {
    db.exec(`ALTER TABLE listings ADD COLUMN rent_median_sqm REAL`);
  }
  if (!listingColumns.includes('rent_sample_size')) {
    db.exec(`ALTER TABLE listings ADD COLUMN rent_sample_size INTEGER`);
  }
  if (!listingColumns.includes('rent_radius_km')) {
    db.exec(`ALTER TABLE listings ADD COLUMN rent_radius_km REAL`);
  }

  const purchases = db
    .prepare(
      `SELECT l.id AS id, l.currency AS currency, l.latitude AS latitude, l.longitude AS longitude
       FROM listings l
              JOIN jobs j ON j.id = l.job_id
       WHERE j.deal_type = ?
         AND l.price_per_sqm IS NOT NULL
         AND l.manually_deleted = 0
         AND l.latitude IS NOT NULL
         AND l.longitude IS NOT NULL`,
    )
    .all(DEAL_TYPES.BUY);
  if (purchases.length === 0) {
    return;
  }

  let comparables = null;
  const runQuery = (sql, params) => (comparables ??= db.prepare(sql)).all(params);
  const write = db.prepare(
    `UPDATE listings
     SET rent_median_sqm  = @median,
         rent_sample_size = @sampleSize,
         rent_radius_km   = @radiusKm
     WHERE id = @id`,
  );

  for (const listing of purchases) {
    const rent = computeBenchmark(listing, DEAL_TYPES.RENT, runQuery, {
      condition: 'l.currency = @currency',
      params: { currency: listing.currency },
    });
    if (rent == null) {
      continue;
    }
    write.run({
      id: listing.id,
      median: rent.medianPricePerSqm,
      sampleSize: rent.sampleSize,
      radiusKm: rent.radiusKm,
    });
  }
}
