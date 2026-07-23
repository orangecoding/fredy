/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN distances JSONB DEFAULT NULL;
    ALTER TABLE listings DROP COLUMN distance_to_destination;
  `);
}
