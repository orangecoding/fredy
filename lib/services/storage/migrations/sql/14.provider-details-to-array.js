/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

// Convert provider_details from a boolean to an array of provider id strings.
// Users will re-configure which providers they want to fetch details from.
export function up(db) {
  const row = db.prepare("SELECT value FROM settings WHERE name = 'provider_details'").get();
  if (row) {
    db.prepare("UPDATE settings SET value = ? WHERE name = 'provider_details'").run(JSON.stringify([]));
  } else {
    db.prepare("INSERT INTO settings (name, value) VALUES ('provider_details', ?)").run(JSON.stringify([]));
  }
}
