/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import crypto from 'crypto';
import { nanoid } from 'nanoid';
import SqliteConnection from '../services/storage/SqliteConnection.js';

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * How long a dynamically registered client may sit without completing an authorization before the
 * sweep drops it. Registration is unauthenticated, so this is what keeps the clients table from
 * growing with every probe that never comes back.
 */
const UNUSED_CLIENT_TTL_MS = 60 * 60 * 1000;

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const secret = () => crypto.randomBytes(32).toString('base64url');

/** @param {{clientName?: string, redirectUris: string[]}} client */
export function createClient({ clientName, redirectUris }) {
  const clientId = nanoid(32);
  SqliteConnection.execute(
    `INSERT INTO mcp_oauth_clients (id, name, redirect_uris, created_at) VALUES (@id, @name, @redirectUris, @createdAt)`,
    { id: clientId, name: clientName ?? null, redirectUris: JSON.stringify(redirectUris), createdAt: Date.now() },
  );
  return { clientId, redirectUris };
}

/** @param {string} clientId */
export function getClient(clientId) {
  const row = SqliteConnection.query(
    `SELECT id, redirect_uris AS redirectUris FROM mcp_oauth_clients WHERE id = @clientId`,
    {
      clientId,
    },
  )[0];
  return row ? { clientId: row.id, redirectUris: JSON.parse(row.redirectUris) } : null;
}

/** @param {{clientId: string, userId: string, redirectUri: string, codeChallenge: string, resource: string, scopes: string[]}} params */
export function createAuthorizationCode(params) {
  const code = secret();
  SqliteConnection.execute(
    `INSERT INTO mcp_oauth_authorization_codes
     (code_hash, client_id, user_id, redirect_uri, code_challenge, resource, scopes, expires_at)
     VALUES (@codeHash, @clientId, @userId, @redirectUri, @codeChallenge, @resource, @scopes, @expiresAt)`,
    {
      ...params,
      codeHash: hash(code),
      scopes: JSON.stringify(params.scopes),
      expiresAt: Date.now() + AUTHORIZATION_CODE_TTL_MS,
    },
  );
  return code;
}

/** @param {{code: string, clientId: string, redirectUri: string, codeVerifier: string}} params */
export function redeemAuthorizationCode(params) {
  return SqliteConnection.withTransaction((db) => {
    const codeHash = hash(params.code);
    const row = db.prepare(`SELECT * FROM mcp_oauth_authorization_codes WHERE code_hash = ?`).get(codeHash);
    if (
      !row ||
      row.expires_at <= Date.now() ||
      row.client_id !== params.clientId ||
      row.redirect_uri !== params.redirectUri
    )
      return null;
    const verifierHash = crypto.createHash('sha256').update(params.codeVerifier).digest('base64url');
    if (verifierHash.length !== row.code_challenge.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(verifierHash), Buffer.from(row.code_challenge))) return null;
    db.prepare(`DELETE FROM mcp_oauth_authorization_codes WHERE code_hash = ?`).run(codeHash);
    return issueTokens(db, {
      clientId: row.client_id,
      userId: row.user_id,
      resource: row.resource,
      scopes: JSON.parse(row.scopes),
      familyId: nanoid(),
    });
  });
}

/**
 * Rotate a refresh token.
 *
 * A refresh token that comes back after it was already rotated, or after it was revoked, means two
 * parties hold the same credential. The whole family is revoked at that point - refresh tokens and
 * the access tokens issued alongside them - so neither party keeps access until expiry.
 *
 * @param {{refreshToken: string, clientId: string}} params
 */
export function refreshAccessToken(params) {
  return SqliteConnection.withTransaction((db) => {
    const row = db
      .prepare(`SELECT * FROM mcp_oauth_refresh_tokens WHERE token_hash = ?`)
      .get(hash(params.refreshToken));
    if (!row || row.client_id !== params.clientId || row.expires_at <= Date.now() || row.revoked_at != null) {
      if (row?.family_id) revokeFamilies(db, [row.family_id]);
      return null;
    }
    db.prepare(`UPDATE mcp_oauth_refresh_tokens SET revoked_at = ? WHERE token_hash = ?`).run(
      Date.now(),
      row.token_hash,
    );
    return issueTokens(db, {
      clientId: row.client_id,
      userId: row.user_id,
      resource: row.resource,
      scopes: JSON.parse(row.scopes),
      familyId: row.family_id,
    });
  });
}

/**
 * Revoke every live credential in the given token families.
 * @param {import('better-sqlite3').Database} db
 * @param {string[]} familyIds
 */
function revokeFamilies(db, familyIds) {
  const now = Date.now();
  const marks = familyIds.map(() => '?').join(', ');
  for (const table of ['mcp_oauth_refresh_tokens', 'mcp_oauth_access_tokens']) {
    db.prepare(`UPDATE ${table} SET revoked_at = ? WHERE revoked_at IS NULL AND family_id IN (${marks})`).run(
      now,
      ...familyIds,
    );
  }
}

/** @param {import('better-sqlite3').Database} db @param {{clientId: string, userId: string, resource: string, scopes: string[], familyId: string}} params */
function issueTokens(db, params) {
  const accessToken = secret();
  const refreshToken = secret();
  const now = Date.now();
  const insert = (table, token, ttl) =>
    db
      .prepare(
        `INSERT INTO ${table} (token_hash, family_id, client_id, user_id, resource, scopes, created_at, expires_at)
         VALUES (@tokenHash, @familyId, @clientId, @userId, @resource, @scopes, @createdAt, @expiresAt)`,
      )
      .run({
        ...params,
        tokenHash: hash(token),
        scopes: JSON.stringify(params.scopes),
        createdAt: now,
        expiresAt: now + ttl,
      });
  insert('mcp_oauth_access_tokens', accessToken, ACCESS_TOKEN_TTL_MS);
  insert('mcp_oauth_refresh_tokens', refreshToken, REFRESH_TOKEN_TTL_MS);
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_MS / 1000, scopes: params.scopes };
}

/** @param {string} token @param {string} resource */
export function validateAccessToken(token, resource) {
  const row = SqliteConnection.query(
    `SELECT user_id AS userId, resource, scopes, expires_at AS expiresAt, revoked_at AS revokedAt
     FROM mcp_oauth_access_tokens WHERE token_hash = @tokenHash LIMIT 1`,
    { tokenHash: hash(token) },
  )[0];
  if (!row || row.resource !== resource || row.expiresAt <= Date.now() || row.revokedAt != null) return null;
  const scopes = JSON.parse(row.scopes);
  return scopes.includes('mcp:read') ? { userId: row.userId, scopes } : null;
}

/**
 * @typedef {object} McpOAuthGrant
 * @property {string} clientId
 * @property {string | null} clientName
 * @property {number} grantedAt - When the user first approved this client.
 */

/**
 * The clients a user has approved and that can still obtain access tokens.
 *
 * A grant is alive as long as one refresh token of it is: access tokens are short-lived and say
 * nothing about whether the client can come back, refresh tokens are the thing a revocation has to
 * take away.
 *
 * @param {string} userId
 * @returns {McpOAuthGrant[]}
 */
export function listGrants(userId) {
  return SqliteConnection.query(
    `SELECT c.id AS clientId, c.name AS clientName, MIN(t.created_at) AS grantedAt
     FROM mcp_oauth_refresh_tokens t
     JOIN mcp_oauth_clients c ON c.id = t.client_id
     WHERE t.user_id = @userId
       AND t.revoked_at IS NULL
       AND t.expires_at > @now
     GROUP BY c.id
     ORDER BY grantedAt DESC`,
    { userId, now: Date.now() },
  );
}

/**
 * Take a client's access to a user's data away, effective immediately.
 *
 * @param {string} userId
 * @param {string} clientId
 * @returns {boolean} False when the user had no grant for that client.
 */
export function revokeGrant(userId, clientId) {
  return SqliteConnection.withTransaction((db) => {
    const families = db
      .prepare(
        `SELECT DISTINCT family_id FROM mcp_oauth_refresh_tokens
         WHERE user_id = ? AND client_id = ? AND revoked_at IS NULL AND expires_at > ?`,
      )
      .all(userId, clientId, Date.now())
      .map((row) => row.family_id);
    if (families.length === 0) return false;
    revokeFamilies(db, families);
    return true;
  });
}

/**
 * Drop what can no longer be used: expired codes and tokens, and registrations that never turned
 * into a grant.
 *
 * Revoked-but-unexpired refresh tokens stay until they expire on purpose. They are what lets a
 * replay be recognised as a replay; deleting them early would turn a detected theft back into a
 * silent one.
 *
 * @param {number} [now]
 * @returns {number} How many rows were removed.
 */
export function sweepExpired(now = Date.now()) {
  return SqliteConnection.withTransaction((db) => {
    let removed = 0;
    for (const table of ['mcp_oauth_authorization_codes', 'mcp_oauth_access_tokens', 'mcp_oauth_refresh_tokens']) {
      removed += db.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).run(now).changes;
    }
    removed += db
      .prepare(
        `DELETE FROM mcp_oauth_clients
         WHERE created_at <= ?
           AND NOT EXISTS (SELECT 1 FROM mcp_oauth_authorization_codes WHERE client_id = mcp_oauth_clients.id)
           AND NOT EXISTS (SELECT 1 FROM mcp_oauth_access_tokens WHERE client_id = mcp_oauth_clients.id)
           AND NOT EXISTS (SELECT 1 FROM mcp_oauth_refresh_tokens WHERE client_id = mcp_oauth_clients.id)`,
      )
      .run(now - UNUSED_CLIENT_TTL_MS).changes;
    return removed;
  });
}
