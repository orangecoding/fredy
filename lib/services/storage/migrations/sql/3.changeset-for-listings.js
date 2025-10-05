// Migration: Adding a changeset field to the listings table in preparation for
// a price watch feature

export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN change_set jsonb;
  `);
}
