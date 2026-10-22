/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Records on every session row which user it signs in.
 *
 * A session lives for up to 30 days, and the user it belonged to was only inside the JSON blob. So
 * nothing could end a user's sessions: an admin who reset the password of a compromised account
 * left the attacker's session working, and a deleted user's rows stayed until they expired.
 *
 * The existing rows are filled from that blob, so the sessions already open are covered as well.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`ALTER TABLE sessions ADD COLUMN user_id TEXT`);
  db.exec(`UPDATE sessions SET user_id = json_extract(data, '$.currentUser') WHERE json_valid(data)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`);
}
