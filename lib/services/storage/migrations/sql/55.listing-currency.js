/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { BENCHMARK_RADII_KM, boundingBox, computeBenchmark } from '../../../listings/marketBenchmark.js';
import { detectScamSignals } from '../../../listings/scamSignals.js';

/**
 * Measure again the listings whose stored benchmark may have mixed two currencies.
 *
 * Until now the comparables were picked by distance alone, so near a border a median could blend
 * francs and euros, and a listing could be flagged as far below a market that was never its own.
 *
 * Only those listings: a benchmark states what the area looked like when Fredy found the listing,
 * and measuring the others again would swap that for today's market. A listing is a candidate when
 * another currency sits anywhere in its widest search box, which is the same box the comparables
 * came from. The price signal hangs off the median, so it is read again with it.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
function remeasureAcrossCurrencies(db) {
  const measured = db
    .prepare(
      `SELECT l.id, l.title, l.description, l.currency, l.latitude, l.longitude, l.price_per_sqm,
              j.deal_type AS dealType
       FROM listings l
              JOIN jobs j ON j.id = l.job_id
       WHERE l.market_median_sqm IS NOT NULL`,
    )
    .all();

  const otherCurrencyNearby = db.prepare(
    `SELECT 1
     FROM listings
     WHERE currency != @currency
       AND latitude BETWEEN @minLat AND @maxLat
       AND longitude BETWEEN @minLng AND @maxLng
     LIMIT 1`,
  );
  const write = db.prepare(
    `UPDATE listings
     SET market_median_sqm  = @median,
         market_sample_size = @sampleSize,
         market_radius_km   = @radiusKm,
         scam_signals       = @signals
     WHERE id = @id`,
  );

  let comparables = null;
  const runQuery = (sql, params) => (comparables ??= db.prepare(sql)).all(params);
  const widest = BENCHMARK_RADII_KM[BENCHMARK_RADII_KM.length - 1];

  for (const listing of measured) {
    const box = boundingBox(listing.latitude, listing.longitude, widest);
    if (otherCurrencyNearby.get({ ...box, currency: listing.currency }) == null) {
      continue;
    }
    const benchmark = computeBenchmark(listing, listing.dealType, runQuery, {
      condition: 'l.currency = @currency',
      params: { currency: listing.currency },
    });
    const median = benchmark?.medianPricePerSqm ?? null;
    const signals = detectScamSignals({ ...listing, market_median_sqm: median });
    write.run({
      id: listing.id,
      median,
      sampleSize: benchmark?.sampleSize ?? null,
      radiusKm: benchmark?.radiusKm ?? null,
      signals: signals.length === 0 ? null : JSON.stringify(signals),
    });
  }
}

/**
 * Keep the currency a listing is priced in on the listing.
 *
 * Benchmarks, the affordability filter and the dashboard medians compare prices in SQL, and SQL has
 * no provider module to ask. Resolving the currency at read time meant generating a clause per host
 * of every provider; a column turns each of those checks into `l.currency = ?`.
 *
 * Only two sources of the listings stored so far price in anything but euros: flatfox, and the
 * Swiss site of BETTERHOMES. Written out here rather than read from the provider modules, because a
 * migration has to keep meaning what it meant when it ran.
 *
 * An instance holding one currency has nothing to measure again, which is nearly all of them.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (!columns.some((column) => column.name === 'currency')) {
    db.exec(`ALTER TABLE listings ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR'`);
  }
  db.exec(
    `UPDATE listings
     SET currency = 'CHF'
     WHERE provider = 'flatfox'
        OR (provider = 'betterhomes'
            AND (link LIKE 'https://www.betterhomes.ch/%' OR link LIKE 'https://betterhomes.ch/%'))`,
  );

  const { currencies } = db.prepare(`SELECT COUNT(DISTINCT currency) AS currencies FROM listings`).get();
  if (currencies > 1) {
    remeasureAcrossCurrencies(db);
  }
}
