/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { MIN_SIZE_SQM } from '../../../listings/marketBenchmark.js';

/**
 * Bring the price per square metre of every repriced listing back in line with its price.
 *
 * A price change rewrote `price` and left `price_per_sqm` at the quotient of the first price, so a
 * flat that dropped from 300.000 to 250.000 kept being shown, compared and sorted as the dearer
 * one. `applyPriceChange` now keeps the two together; this is the catch-up for the rows repriced
 * before it did. Only those can be off: every other row still has the price it was stored with.
 *
 * Same quotient and rounding as migration 41, so a repaired row and a freshly stored one never
 * differ in the last digit. A row whose price or size does not give a usable quotient is cleared,
 * which is what `pricePerSqm` answers for it.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    UPDATE listings
    SET price_per_sqm = CASE
                          WHEN price > 0 AND size >= ${MIN_SIZE_SQM} THEN ROUND(CAST(price AS REAL) / size, 2)
                          ELSE NULL
                        END
    WHERE price_changed_at IS NOT NULL
  `);
}
