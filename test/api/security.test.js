/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// userStorage is only needed by isAdmin/adminHook - mock it so the suite has no DB dependency.
vi.mock('../../lib/services/storage/userStorage.js', () => ({
  getUser: vi.fn(),
}));
// security.js reads sessionTTL at import time. An empty settings object exercises the default.
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({ getSettings: vi.fn(async () => ({})) }));

import { getUser } from '../../lib/services/storage/userStorage.js';
import { isUnauthorized, isAdmin, authHook, adminHook, touchSession } from '../../lib/api/security.js';

const SESSION_MAX_AGE = 2 * 60 * 60 * 1000; // the default applied when sessionTTL is unset

/**
 * Re-import security.js with a specific sessionTTL setting.
 *
 * The TTL is read live per request now rather than snapshotted at module load, but the module
 * registry is still reset per scenario so each case gets a clean settings mock.
 * @param {any} sessionTTL - The raw setting value as it would come from the settings table.
 * @returns {Promise<typeof import('../../lib/api/security.js')>}
 */
async function importSecurityWithTtl(sessionTTL) {
  vi.resetModules();
  vi.doMock('../../lib/services/storage/userStorage.js', () => ({ getUser: vi.fn() }));
  vi.doMock('../../lib/services/storage/settingsStorage.js', () => ({
    getSettings: vi.fn(async () => ({ sessionTTL })),
  }));
  return import('../../lib/api/security.js');
}

const sessionAgedHours = (hours) => ({ currentUser: 'user-1', createdAt: Date.now() - hours * 60 * 60 * 1000 });

/**
 * Minimal Fastify reply double recording the status code and whether send() was called.
 */
function makeReply() {
  return {
    statusCode: null,
    sent: false,
    code(c) {
      this.statusCode = c;
      return this;
    },
    send() {
      this.sent = true;
      return this;
    },
  };
}

const freshSession = () => ({ currentUser: 'user-1', createdAt: Date.now() });
const expiredSession = () => ({ currentUser: 'user-1', createdAt: Date.now() - (SESSION_MAX_AGE + 1000) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isUnauthorized', () => {
  it('is unauthorized when there is no session', async () => {
    expect(await isUnauthorized({})).toBe(true);
  });

  it('is unauthorized when the session has no currentUser', async () => {
    expect(await isUnauthorized({ session: { createdAt: Date.now() } })).toBe(true);
  });

  it('is unauthorized when the session is older than the max age (hard expiry)', async () => {
    expect(await isUnauthorized({ session: expiredSession() })).toBe(true);
  });

  it('is authorized for a fresh session', async () => {
    expect(await isUnauthorized({ session: freshSession() })).toBe(false);
  });
});

describe('session max age', () => {
  it('honors a configured sessionTTL above the two hour default', async () => {
    const { isUnauthorized: check, sessionMaxAge: maxAge } = await importSecurityWithTtl(24);

    expect(await maxAge()).toBe(24 * 60 * 60 * 1000);
    // Would have expired under the previously hard-coded two hour cap.
    expect(await check({ session: sessionAgedHours(3) })).toBe(false);
    expect(await check({ session: sessionAgedHours(25) })).toBe(true);
  });

  it('honors a sessionTTL shorter than the default', async () => {
    const { isUnauthorized: check } = await importSecurityWithTtl(1);

    expect(await check({ session: sessionAgedHours(0.5) })).toBe(false);
    expect(await check({ session: sessionAgedHours(1.5) })).toBe(true);
  });

  it('accepts the numeric string the settings UI stores', async () => {
    const { sessionMaxAge: maxAge } = await importSecurityWithTtl('12');

    expect(await maxAge()).toBe(12 * 60 * 60 * 1000);
  });

  it('follows a sessionTTL changed after startup, without a restart', async () => {
    // The whole point of reading it live: the setting used to be snapshotted at module load, so
    // changing it in the UI appeared to work and did nothing.
    vi.resetModules();
    let ttl = 1;
    vi.doMock('../../lib/services/storage/userStorage.js', () => ({ getUser: vi.fn() }));
    vi.doMock('../../lib/services/storage/settingsStorage.js', () => ({
      getSettings: vi.fn(async () => ({ sessionTTL: ttl })),
    }));
    const { sessionMaxAge: maxAge } = await import('../../lib/api/security.js');

    expect(await maxAge()).toBe(60 * 60 * 1000);
    ttl = 8;
    expect(await maxAge()).toBe(8 * 60 * 60 * 1000);
  });

  it.each([['not-a-number'], [''], [0], [-5], [null], [undefined]])(
    'falls back to the default instead of never expiring for sessionTTL %o',
    async (value) => {
      // A NaN or non-positive max age would make the expiry comparison always false,
      // leaving sessions valid forever.
      const { sessionMaxAge: maxAge, isUnauthorized: check } = await importSecurityWithTtl(value);

      expect(await maxAge()).toBe(SESSION_MAX_AGE);
      expect(await check({ session: sessionAgedHours(3) })).toBe(true);
    },
  );
});

describe('touchSession', () => {
  it('moves the session timestamp forward so the TTL behaves as an idle timeout', () => {
    const session = sessionAgedHours(1.5);
    touchSession({ session });

    expect(Date.now() - session.createdAt).toBeLessThan(1000);
  });

  it('does nothing when there is no session', () => {
    expect(() => touchSession({})).not.toThrow();
  });
});

describe('authHook', () => {
  it('short-circuits the lifecycle by returning the reply when unauthorized', async () => {
    const reply = makeReply();
    const result = await authHook({ session: expiredSession() }, reply);

    // Returning the reply is what tells Fastify to stop and NOT run the route handler.
    expect(result).toBe(reply);
    expect(reply.statusCode).toBe(401);
    expect(reply.sent).toBe(true);
  });

  it('does not touch the reply for an authorized request', async () => {
    getUser.mockReturnValue({ id: 'user-1', isAdmin: false });
    const reply = makeReply();
    const result = await authHook({ session: freshSession() }, reply);

    expect(result).toBeUndefined();
    expect(reply.statusCode).toBeNull();
    expect(reply.sent).toBe(false);
  });

  it('resolves the user once and hangs it on the request', async () => {
    // Routes ask isAdmin() several times per request; this is what stops each of those being
    // another SELECT with a correlated subquery.
    getUser.mockReturnValue({ id: 'user-1', isAdmin: true });
    const request = { session: freshSession() };
    await authHook(request, makeReply());

    expect(request.currentUser).toEqual({ id: 'user-1', isAdmin: true });
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('rejects a session pointing at a user that no longer exists', async () => {
    getUser.mockReturnValue(null);
    const reply = makeReply();
    const result = await authHook({ session: freshSession() }, reply);

    expect(result).toBe(reply);
    expect(reply.statusCode).toBe(401);
  });

  it('extends the session of an authorized request', async () => {
    getUser.mockReturnValue({ id: 'user-1', isAdmin: false });
    const session = sessionAgedHours(1.5);
    await authHook({ session }, makeReply());

    expect(Date.now() - session.createdAt).toBeLessThan(1000);
  });

  it('does not extend the session of a rejected request', async () => {
    const session = expiredSession();
    const before = session.createdAt;
    await authHook({ session }, makeReply());

    expect(session.createdAt).toBe(before);
  });
});

describe('isAdmin / adminHook', () => {
  it('reads the user authHook resolved, without querying again', () => {
    expect(isAdmin({ currentUser: { id: 'user-1', isAdmin: true } })).toBe(true);
    expect(isAdmin({ currentUser: { id: 'user-1', isAdmin: false } })).toBe(false);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('is not admin without a resolved user, so a route reached outside authHook fails closed', () => {
    expect(isAdmin({})).toBe(false);
    expect(isAdmin({ currentUser: null })).toBe(false);
  });

  it('short-circuits with a 401 reply for a non-admin request', async () => {
    const reply = makeReply();
    const result = await adminHook({ currentUser: { id: 'user-1', isAdmin: false } }, reply);

    expect(result).toBe(reply);
    expect(reply.statusCode).toBe(401);
    expect(reply.sent).toBe(true);
  });

  it('lets an admin request through untouched', async () => {
    const reply = makeReply();
    const result = await adminHook({ currentUser: { id: 'user-1', isAdmin: true } }, reply);

    expect(result).toBeUndefined();
    expect(reply.sent).toBe(false);
  });
});
