// Migration: there needs to be a unique index on job_id and hash as only
// this makes the listing indeed unique

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_list
    (
      id         TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)    REFERENCES users    (id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_list ON watch_list (listing_id, user_id);
  `);
}
