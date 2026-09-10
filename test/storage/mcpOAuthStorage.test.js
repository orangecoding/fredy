/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'crypto';

import { up } from '../../lib/services/storage/migrations/sql/36.mcp-oauth.js';

/**
 * The MCP OAuth credential store, run against a real SQLite built by the real migration.
 *
 * What matters here is the lifecycle rather than any single query: a code becomes tokens once, a
 * refresh token rotates, a replayed refresh token takes the whole family down including the access
 * token that is still live, and the sweep removes what has expired without touching what has not.
 */
describe('mcp oauth storage', () => {
  const NOW = 1_800_000_000_000;
  const HOUR = 60 * 60 * 1000;
  const RESOURCE = 'https://fredy.example/api/mcp';

  let db;
  let storage;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users (id) VALUES ('u1'), ('u2');`);
    up(db);

    vi.resetModules();
    vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params),
        execute: (sql, params) => db.prepare(sql).run(params),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    storage = await import('../../lib/mcp/mcpOAuthStorage.js');
  });

  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });

  const verifier = 'v'.repeat(43);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

  const grant = ({ userId = 'u1', clientName = 'Claude', scopes = ['mcp:read'] } = {}) => {
    const client = storage.createClient({ clientName, redirectUris: ['https://claude.ai/cb'] });
    const code = storage.createAuthorizationCode({
      clientId: client.clientId,
      userId,
      redirectUri: 'https://claude.ai/cb',
      codeChallenge: challenge,
      resource: RESOURCE,
      scopes,
    });
    const tokens = storage.redeemAuthorizationCode({
      code,
      clientId: client.clientId,
      redirectUri: 'https://claude.ai/cb',
      codeVerifier: verifier,
    });
    return { client, tokens };
  };

  it('names its tables after the MCP resource they serve', () => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%oauth%' ORDER BY name`)
      .all()
      .map((row) => row.name);
    expect(tables).toEqual([
      'mcp_oauth_access_tokens',
      'mcp_oauth_authorization_codes',
      'mcp_oauth_clients',
      'mcp_oauth_refresh_tokens',
    ]);
  });

  it('turns a code into tokens exactly once', () => {
    const { client, tokens } = grant();
    expect(storage.validateAccessToken(tokens.accessToken, RESOURCE)).toEqual({ userId: 'u1', scopes: ['mcp:read'] });
    expect(storage.validateAccessToken(tokens.accessToken, 'https://other.example/api/mcp')).toBeNull();
    expect(
      storage.redeemAuthorizationCode({
        code: 'not-the-code',
        clientId: client.clientId,
        redirectUri: 'https://claude.ai/cb',
        codeVerifier: verifier,
      }),
    ).toBeNull();
  });

  it('revokes the live access token when a refresh token is replayed', () => {
    const { client, tokens } = grant();
    const rotated = storage.refreshAccessToken({ refreshToken: tokens.refreshToken, clientId: client.clientId });
    expect(rotated).not.toBeNull();
    expect(storage.validateAccessToken(rotated.accessToken, RESOURCE)).not.toBeNull();

    // Replay of the already-rotated token: someone other than the legitimate client has it.
    expect(storage.refreshAccessToken({ refreshToken: tokens.refreshToken, clientId: client.clientId })).toBeNull();

    expect(storage.validateAccessToken(rotated.accessToken, RESOURCE)).toBeNull();
    expect(storage.validateAccessToken(tokens.accessToken, RESOURCE)).toBeNull();
    expect(storage.refreshAccessToken({ refreshToken: rotated.refreshToken, clientId: client.clientId })).toBeNull();
  });

  it('lists one grant per client a user has authorized and lets them revoke it', () => {
    const mine = grant({ clientName: 'Claude' });
    grant({ userId: 'u2', clientName: 'ChatGPT' });
    storage.refreshAccessToken({ refreshToken: mine.tokens.refreshToken, clientId: mine.client.clientId });

    expect(storage.listGrants('u1')).toEqual([
      { clientId: mine.client.clientId, clientName: 'Claude', grantedAt: NOW, scopes: ['mcp:read'] },
    ]);

    expect(storage.revokeGrant('u1', mine.client.clientId)).toBe(true);
    expect(storage.listGrants('u1')).toEqual([]);
    expect(storage.validateAccessToken(mine.tokens.accessToken, RESOURCE)).toBeNull();
    expect(storage.listGrants('u2')).toHaveLength(1);
  });

  /**
   * The settings page shows what each connection may do. A grant approved before the write tools
   * existed carries only `mcp:read`, and reporting it as anything else would tell somebody their
   * connection can write when every write tool will refuse it.
   */
  it('reports what each grant may actually do', () => {
    grant({ clientName: 'Claude', scopes: ['mcp:read', 'mcp:write'] });
    grant({ clientName: 'Old connector', scopes: ['mcp:read'] });

    const byName = Object.fromEntries(storage.listGrants('u1').map((entry) => [entry.clientName, entry.scopes]));

    expect(byName['Claude']).toEqual(['mcp:read', 'mcp:write']);
    expect(byName['Old connector']).toEqual(['mcp:read']);
  });

  it('keeps the scopes across a refresh, so a read-only grant does not gain write access by aging', () => {
    const readOnly = grant({ scopes: ['mcp:read'] });

    const rotated = storage.refreshAccessToken({
      refreshToken: readOnly.tokens.refreshToken,
      clientId: readOnly.client.clientId,
    });

    expect(rotated.scopes).toEqual(['mcp:read']);
    expect(storage.validateAccessToken(rotated.accessToken, RESOURCE)).toEqual({ userId: 'u1', scopes: ['mcp:read'] });
    expect(storage.listGrants('u1')[0].scopes).toEqual(['mcp:read']);
  });

  it('answers with the union when one client holds tokens of differing scope', () => {
    // What a reconnection looks like mid-flight: the old read-only family is still live while the
    // new one has write. The client can obtain a token that writes, so the page must say so.
    const client = storage.createClient({ clientName: 'Claude', redirectUris: ['https://claude.ai/cb'] });
    for (const scopes of [['mcp:read'], ['mcp:read', 'mcp:write']]) {
      const code = storage.createAuthorizationCode({
        clientId: client.clientId,
        userId: 'u1',
        redirectUri: 'https://claude.ai/cb',
        codeChallenge: challenge,
        resource: RESOURCE,
        scopes,
      });
      storage.redeemAuthorizationCode({
        code,
        clientId: client.clientId,
        redirectUri: 'https://claude.ai/cb',
        codeVerifier: verifier,
      });
    }

    expect(storage.listGrants('u1')).toEqual([
      { clientId: client.clientId, clientName: 'Claude', grantedAt: NOW, scopes: ['mcp:read', 'mcp:write'] },
    ]);
  });

  it('does not let a user revoke another user’s grant', () => {
    const theirs = grant({ userId: 'u2' });
    expect(storage.revokeGrant('u1', theirs.client.clientId)).toBe(false);
    expect(storage.listGrants('u2')).toHaveLength(1);
  });

  it('sweeps expired credentials and clients that never completed a grant', () => {
    const live = grant();
    storage.createClient({ clientName: 'abandoned', redirectUris: ['https://x.example/cb'] });
    storage.createAuthorizationCode({
      clientId: live.client.clientId,
      userId: 'u1',
      redirectUri: 'https://claude.ai/cb',
      codeChallenge: challenge,
      resource: RESOURCE,
      scopes: ['mcp:read'],
    });

    // Nothing has expired yet, and the abandoned registration is younger than the grace period.
    expect(storage.sweepExpired()).toBe(0);

    vi.setSystemTime(NOW + 2 * HOUR);
    const removed = storage.sweepExpired();
    // One expired code, one expired access token, one orphaned client.
    expect(removed).toBe(3);
    expect(db.prepare(`SELECT count(*) AS n FROM mcp_oauth_clients`).get().n).toBe(1);
    expect(db.prepare(`SELECT count(*) AS n FROM mcp_oauth_authorization_codes`).get().n).toBe(0);
    expect(db.prepare(`SELECT count(*) AS n FROM mcp_oauth_access_tokens`).get().n).toBe(0);
    // The refresh token is still valid, so the grant survives.
    expect(storage.listGrants('u1')).toHaveLength(1);
  });
});
