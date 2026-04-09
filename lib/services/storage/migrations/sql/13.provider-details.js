/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

// We have moved the previous immoscout_details setting to provider_details and enable this by default
// We also set it to false per default as this is increasing the chance to be detected as a bot by a lot
export function up(db) {
  db.exec(`
    UPDATE settings
    SET name = 'provider_details', value = false
    WHERE name = 'immoscout_details'
      AND NOT EXISTS (
      SELECT 1 FROM settings WHERE name = 'provider_details'
    );
  `);
}
