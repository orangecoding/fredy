/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */
import crypto from 'crypto';

// Migration: Add mcp_token column to users table.
// Each user gets a permanent, non-expiring secret token used for MCP API authentication.
// Tokens are auto-generated for all existing users during this migration.
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(users)`).all();
  if (!columns.some((col) => col.name === 'mcp_token')) {
    db.exec(`ALTER TABLE users ADD COLUMN mcp_token TEXT`);
  }

  // Backfill all existing users that don't have a token yet
  const users = db.prepare(`SELECT id FROM users WHERE mcp_token IS NULL`).all();
  const update = db.prepare(`UPDATE users SET mcp_token = @token WHERE id = @id`);
  for (const user of users) {
    const token = `fredy_${crypto.randomBytes(32).toString('hex')}`;
    update.run({ id: user.id, token });
  }
}
