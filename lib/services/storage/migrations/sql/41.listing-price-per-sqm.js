/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { COMPARABLES_SQL, MIN_SIZE_SQM, computeBenchmark } from '../../../listings/marketBenchmark.js';

/**
 * Price per square metre, and how it compares to the area around each listing.
 *
 * Four columns rather than a computed view. The quotient itself could be arithmetic in every
 * query, but the median around a listing cannot: it is a second pass over the table per row, and
 * doing that inside the paginated listings query would put a correlated subquery on the busiest
 * route in the app. So the answer is written down once, when the listing arrives.
 *
 * The consequence is that a benchmark states what the area looked like when Fredy found the
 * listing, not what it looks like today. That is the honest reading anyway: the sample it came from
 * is the set of flats that were on the market at the same time, which is what somebody deciding
 * whether to apply is actually comparing against.
 *
 * The backfill below is the one-off catch-up for everything already stored. It costs one query per
 * located listing, bounded to 300 rows each by the module's cap, and runs inside the migration's
 * transaction like every other migration here.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('price_per_sqm')) {
    db.exec(`ALTER TABLE listings ADD COLUMN price_per_sqm REAL`);
  }
  if (missing('market_median_sqm')) {
    db.exec(`ALTER TABLE listings ADD COLUMN market_median_sqm REAL`);
  }
  if (missing('market_sample_size')) {
    db.exec(`ALTER TABLE listings ADD COLUMN market_sample_size INTEGER`);
  }
  if (missing('market_radius_km')) {
    db.exec(`ALTER TABLE listings ADD COLUMN market_radius_km REAL`);
  }

  // The benchmark asks for everything inside a latitude and longitude window, once per listing.
  // Without this index that window is a full scan of the table, which is what turns the backfill
  // below from seconds into minutes on an instance that has been running for a year.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_geo ON listings (latitude, longitude)`);

  // The quotient is intrinsic to a row, so it needs no neighbours and no loop. Rounded to the cent
  // in SQL exactly as `pricePerSqm` rounds it in JS, so a backfilled row and a freshly stored one
  // never differ in the last digit.
  db.exec(`
    UPDATE listings
    SET price_per_sqm = ROUND(CAST(price AS REAL) / size, 2)
    WHERE price > 0
      AND size >= ${MIN_SIZE_SQM}
  `);

  const located = db
    .prepare(
      `SELECT l.id AS id, l.latitude AS latitude, l.longitude AS longitude, j.deal_type AS dealType
       FROM listings l
              JOIN jobs j ON j.id = l.job_id
       WHERE l.price_per_sqm IS NOT NULL
         AND l.manually_deleted = 0
         AND l.latitude IS NOT NULL
         AND l.longitude IS NOT NULL
         AND j.deal_type IS NOT NULL`,
    )
    .all();

  if (located.length === 0) {
    return;
  }

  const comparables = db.prepare(COMPARABLES_SQL);
  const runQuery = (_sql, params) => comparables.all(params);
  const write = db.prepare(
    `UPDATE listings
     SET market_median_sqm  = @median,
         market_sample_size = @sampleSize,
         market_radius_km   = @radiusKm
     WHERE id = @id`,
  );

  for (const listing of located) {
    const benchmark = computeBenchmark(listing, listing.dealType, runQuery);
    if (benchmark == null) {
      continue;
    }
    write.run({
      id: listing.id,
      median: benchmark.medianPricePerSqm,
      sampleSize: benchmark.sampleSize,
      radiusKm: benchmark.radiusKm,
    });
  }
}
