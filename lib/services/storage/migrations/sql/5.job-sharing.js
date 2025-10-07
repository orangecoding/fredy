// Migration: Adding a new table to store if somebody "watches" (a.k.a favorite) a listing

export function up(db) {
  db.exec(`
    ALTER TABLE jobs ADD COLUMN shared_with_user jsonb DEFAULT '[]'
  `);
}
