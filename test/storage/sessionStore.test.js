/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * @fastify/session's default store keeps sessions in a process-local map: they are lost on
 * restart (every upgrade logs everyone out), nothing ever evicts expired entries, and two
 * processes cannot share them. This store puts them in the database Fredy already has.
 */
describe('SqliteSessionStore', () => {
  let db;
  let store;
  let sweepExpiredSessions;

  const NOW = 1_800_000_000_000;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE sessions (
        sid TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);

    vi.resetModules();
    vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params),
        execute: (sql, params) => db.prepare(sql).run(params),
      },
    }));
    vi.doMock('../../lib/services/logger.js', () => ({
      default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    }));

    const mod = await import('../../lib/services/storage/sessionStore.js');
    store = new mod.SqliteSessionStore();
    sweepExpiredSessions = mod.sweepExpiredSessions;
  });

  afterEach(() => db.close());

  /** Promise wrappers around the callback-style store interface. */
  const set = (sid, session) =>
    new Promise((resolve, reject) => store.set(sid, session, (e) => (e ? reject(e) : resolve())));
  const get = (sid) => new Promise((resolve, reject) => store.get(sid, (e, s) => (e ? reject(e) : resolve(s))));
  const destroy = (sid) => new Promise((resolve, reject) => store.destroy(sid, (e) => (e ? reject(e) : resolve())));

  const sessionFor = (userId, maxAge = 60_000) => ({
    currentUser: userId,
    createdAt: Date.now(),
    cookie: { originalMaxAge: maxAge, expires: new Date(Date.now() + maxAge) },
  });

  it('round-trips a session', async () => {
    await set('sid-1', sessionFor('user-1'));
    const loaded = await get('sid-1');
    expect(loaded.currentUser).toBe('user-1');
  });

  it('returns null for an unknown session', async () => {
    expect(await get('never-existed')).toBeNull();
  });

  it('overwrites an existing session rather than failing on the primary key', async () => {
    await set('sid-1', sessionFor('user-1'));
    await set('sid-1', sessionFor('user-2'));
    expect((await get('sid-1')).currentUser).toBe('user-2');
    expect(db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c).toBe(1);
  });

  it('destroys a session on logout', async () => {
    await set('sid-1', sessionFor('user-1'));
    await destroy('sid-1');
    expect(await get('sid-1')).toBeNull();
  });

  it('treats an expired row as absent', async () => {
    db.prepare('INSERT INTO sessions (sid, data, expires_at) VALUES (?,?,?)').run(
      'stale',
      JSON.stringify({ currentUser: 'user-1' }),
      Date.now() - 1000,
    );
    expect(await get('stale')).toBeNull();
  });

  it('deletes an expired row it stumbles over, so a stale cookie cannot resurrect it', async () => {
    db.prepare('INSERT INTO sessions (sid, data, expires_at) VALUES (?,?,?)').run(
      'stale',
      JSON.stringify({ currentUser: 'user-1' }),
      Date.now() - 1000,
    );
    await get('stale');
    expect(db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c).toBe(0);
  });

  it('survives a restart, which is the point of not keeping sessions in memory', async () => {
    await set('sid-1', sessionFor('user-1'));
    // A "restart" is a new store instance against the same database.
    const { SqliteSessionStore } = await import('../../lib/services/storage/sessionStore.js');
    const afterRestart = new SqliteSessionStore();
    const loaded = await new Promise((resolve, reject) =>
      afterRestart.get('sid-1', (e, s) => (e ? reject(e) : resolve(s))),
    );
    expect(loaded.currentUser).toBe('user-1');
  });

  it('reports a corrupted row as an error rather than crashing the request', async () => {
    db.prepare('INSERT INTO sessions (sid, data, expires_at) VALUES (?,?,?)').run(
      'broken',
      'not json',
      Date.now() + 60_000,
    );
    await expect(get('broken')).rejects.toBeInstanceOf(Error);
  });

  it('falls back to a bounded lifetime when the cookie carries no expiry', async () => {
    await set('sid-1', { currentUser: 'user-1' });
    const { expires_at: expiresAt } = db.prepare('SELECT expires_at FROM sessions WHERE sid = ?').get('sid-1');
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  describe('sweepExpiredSessions', () => {
    it('removes only the expired rows', () => {
      db.prepare('INSERT INTO sessions (sid, data, expires_at) VALUES (?,?,?)').run('old', '{}', NOW - 1);
      db.prepare('INSERT INTO sessions (sid, data, expires_at) VALUES (?,?,?)').run('current', '{}', NOW + 60_000);

      expect(sweepExpiredSessions(NOW)).toBe(1);
      expect(
        db
          .prepare('SELECT sid FROM sessions')
          .all()
          .map((r) => r.sid),
      ).toEqual(['current']);
    });

    it('reports zero when there is nothing to remove', () => {
      expect(sweepExpiredSessions(NOW)).toBe(0);
    });
  });
});
