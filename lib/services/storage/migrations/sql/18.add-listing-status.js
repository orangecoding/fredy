/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN status JSON;
    CREATE INDEX IF NOT EXISTS idx_listings_status ON listings (json_extract(status, '$.status'));
  `);
}
