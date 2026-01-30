/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

export function up(db) {
  // 1. Remove old unique index
  db.exec(`DROP INDEX IF EXISTS idx_settings_name;`);

  // 2. Remove duplicates before creating unique index.
  // Keep only the row with the highest rowid (most recent) for each (name, user_id) pair.
  db.exec(`
    DELETE FROM settings
    WHERE rowid NOT IN (
      SELECT MAX(rowid)
      FROM settings
      GROUP BY name, IFNULL(user_id, 'GLOBAL_SETTING')
    );
  `);

  // 3. Add new unique index for name and user_id.
  // Since user_id can be NULL, we need a special index or use coalesce for the index.
  // In SQLite, multiple NULLs are allowed in a UNIQUE index, which is fine for our global settings (user_id IS NULL).
  // But we want only one global setting for a given name.
  // Actually, in SQLite, UNIQUE allows multiple NULL values.
  // To have only one NULL user_id for a name, we can use a partial index or COALESCE.

  db.exec(`
    CREATE UNIQUE INDEX idx_settings_name_user_id ON settings (name, IFNULL(user_id, 'GLOBAL_SETTING'));
  `);
}
