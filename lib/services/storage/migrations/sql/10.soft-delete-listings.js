/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

export function up(db) {
  // 1. Add manually_deleted column
  db.exec(`ALTER TABLE listings ADD COLUMN manually_deleted INTEGER NOT NULL DEFAULT 0;`);

  // 2. Remove change_set column
  try {
    db.exec(`ALTER TABLE listings DROP COLUMN change_set;`);
  } catch {
    // if column does not exists for whatever reason
  }
}
