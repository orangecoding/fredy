// Migration: Add additionalpictures column to listings table

export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN additionalpictures TEXT;
  `);
}
