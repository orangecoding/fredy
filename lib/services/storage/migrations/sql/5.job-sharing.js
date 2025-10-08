// Migration: Adding a new table to store if somebody shared a job with someone

export function up(db) {
  db.exec(`
    ALTER TABLE jobs ADD COLUMN shared_with_user jsonb DEFAULT '[]'
  `);
}
