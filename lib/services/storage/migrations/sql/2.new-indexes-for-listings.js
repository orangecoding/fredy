// Migration: there needs to be a unique index on job_id and hash as only
// this makes the listing indeed unique

export function up(db) {
  db.exec(`
    DROP INDEX IF EXISTS idx_listings_hash;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_job_hash
      ON listings (job_id, hash);
  `);
}
