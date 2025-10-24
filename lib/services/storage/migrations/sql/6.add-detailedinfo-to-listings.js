// Migration: Add detailedinfo column to listings table

export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN detailedinfo TEXT;
  `);
}
