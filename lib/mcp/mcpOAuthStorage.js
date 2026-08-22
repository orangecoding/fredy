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

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const secret = () => crypto.randomBytes(32).toString('base64url');

/** @param {{clientName?: string, redirectUris: string[]}} client */
export function createClient({ clientName, redirectUris }) {
  const clientId = nanoid(32);
  SqliteConnection.execute(
    `INSERT INTO oauth_clients (id, name, redirect_uris, created_at) VALUES (@id, @name, @redirectUris, @createdAt)`,
    { id: clientId, name: clientName ?? null, redirectUris: JSON.stringify(redirectUris), createdAt: Date.now() },
  );
  return { clientId, redirectUris };
}

/** @param {string} clientId */
export function getClient(clientId) {
  const row = SqliteConnection.query(
    `SELECT id, redirect_uris AS redirectUris FROM oauth_clients WHERE id = @clientId`,
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
    `INSERT INTO oauth_authorization_codes
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
    const row = db.prepare(`SELECT * FROM oauth_authorization_codes WHERE code_hash = ?`).get(codeHash);
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
    db.prepare(`DELETE FROM oauth_authorization_codes WHERE code_hash = ?`).run(codeHash);
    return issueTokens(db, {
      clientId: row.client_id,
      userId: row.user_id,
      resource: row.resource,
      scopes: JSON.parse(row.scopes),
      familyId: nanoid(),
    });
  });
}

/** @param {{refreshToken: string, clientId: string}} params */
export function refreshAccessToken(params) {
  return SqliteConnection.withTransaction((db) => {
    const row = db.prepare(`SELECT * FROM oauth_refresh_tokens WHERE token_hash = ?`).get(hash(params.refreshToken));
    if (!row || row.client_id !== params.clientId || row.expires_at <= Date.now() || row.revoked_at != null) {
      if (row?.family_id)
        db.prepare(`UPDATE oauth_refresh_tokens SET revoked_at = ? WHERE family_id = ?`).run(Date.now(), row.family_id);
      return null;
    }
    db.prepare(`UPDATE oauth_refresh_tokens SET revoked_at = ? WHERE token_hash = ?`).run(Date.now(), row.token_hash);
    return issueTokens(db, {
      clientId: row.client_id,
      userId: row.user_id,
      resource: row.resource,
      scopes: JSON.parse(row.scopes),
      familyId: row.family_id,
    });
  });
}

/** @param {import('better-sqlite3').Database} db @param {{clientId: string, userId: string, resource: string, scopes: string[], familyId: string}} params */
function issueTokens(db, params) {
  const accessToken = secret();
  const refreshToken = secret();
  const now = Date.now();
  db.prepare(
    `INSERT INTO oauth_access_tokens (token_hash, client_id, user_id, resource, scopes, expires_at)
     VALUES (@tokenHash, @clientId, @userId, @resource, @scopes, @expiresAt)`,
  ).run({
    ...params,
    tokenHash: hash(accessToken),
    scopes: JSON.stringify(params.scopes),
    expiresAt: now + ACCESS_TOKEN_TTL_MS,
  });
  db.prepare(
    `INSERT INTO oauth_refresh_tokens (token_hash, family_id, client_id, user_id, resource, scopes, expires_at)
     VALUES (@tokenHash, @familyId, @clientId, @userId, @resource, @scopes, @expiresAt)`,
  ).run({
    ...params,
    tokenHash: hash(refreshToken),
    scopes: JSON.stringify(params.scopes),
    expiresAt: now + REFRESH_TOKEN_TTL_MS,
  });
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_MS / 1000, scopes: params.scopes };
}

/** @param {string} token @param {string} resource */
export function validateAccessToken(token, resource) {
  const row = SqliteConnection.query(
    `SELECT user_id AS userId, resource, scopes, expires_at AS expiresAt, revoked_at AS revokedAt
     FROM oauth_access_tokens WHERE token_hash = @tokenHash LIMIT 1`,
    { tokenHash: hash(token) },
  )[0];
  if (!row || row.resource !== resource || row.expiresAt <= Date.now() || row.revokedAt != null) return null;
  const scopes = JSON.parse(row.scopes);
  return scopes.includes('mcp:read') ? { userId: row.userId, scopes } : null;
}
