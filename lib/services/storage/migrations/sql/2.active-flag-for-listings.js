// Migration: there needs to be a unique index on job_id and hash as only
// this makes the listing indeed unique

export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN is_active INTEGER DEFAULT 1;
  `);
}
