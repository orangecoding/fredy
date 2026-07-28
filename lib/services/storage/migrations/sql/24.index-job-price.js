/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Index supporting the dashboard's median price.
 *
 * The KPI query orders a job's listings by price and offsets into the middle of the result. Without
 * an index that is a full scan plus a sort of every listing the user can see, on the app's landing
 * route. With `(job_id, price)` SQLite walks the index in order and stops at the offset.
 *
 * The same index also serves the price range filter and "sort by price" on the listings page,
 * which are the other two places that order by this column.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_job_price ON listings (job_id, price)`);
}
