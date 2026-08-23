/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * OAuth credentials for the MCP protected resource.
 *
 * The tables carry the `mcp_oauth_` prefix because this is all they serve: one scope, one resource.
 * Fredy is not a general authorization server and the names should not suggest otherwise.
 *
 * Raw codes and tokens are never persisted: a database read alone must not grant API access.
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
      id TEXT PRIMARY KEY,
      name TEXT,
      redirect_uris TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mcp_oauth_authorization_codes (
      code_hash TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      redirect_uri TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      resource TEXT NOT NULL,
      scopes TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mcp_oauth_access_tokens (
      token_hash TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resource TEXT NOT NULL,
      scopes TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS mcp_oauth_refresh_tokens (
      token_hash TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resource TEXT NOT NULL,
      scopes TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_oauth_authorization_codes_expiry ON mcp_oauth_authorization_codes (expires_at);
    CREATE INDEX IF NOT EXISTS idx_mcp_oauth_authorization_codes_client ON mcp_oauth_authorization_codes (client_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_oauth_access_tokens_family ON mcp_oauth_access_tokens (family_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_oauth_access_tokens_expiry ON mcp_oauth_access_tokens (expires_at);
    CREATE INDEX IF NOT EXISTS idx_mcp_oauth_access_tokens_client ON mcp_oauth_access_tokens (client_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_oauth_refresh_tokens_family ON mcp_oauth_refresh_tokens (family_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_oauth_refresh_tokens_expiry ON mcp_oauth_refresh_tokens (expires_at);
    CREATE INDEX IF NOT EXISTS idx_mcp_oauth_refresh_tokens_client ON mcp_oauth_refresh_tokens (client_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_oauth_refresh_tokens_user ON mcp_oauth_refresh_tokens (user_id, client_id);
  `);
}
