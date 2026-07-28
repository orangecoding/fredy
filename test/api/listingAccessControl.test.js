/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Listing id -> owning user, plus who the owning job is shared with. The SqliteConnection double
 * answers the access query out of this, so a test only has to describe ownership.
 * @type {Record<string, {owner: string, sharedWith: string[]}>}
 */
const LISTINGS = {
  'mine-1': { owner: 'alice', sharedWith: [] },
  'mine-2': { owner: 'alice', sharedWith: [] },
  'shared-with-me': { owner: 'bob', sharedWith: ['alice'] },
  'someone-elses': { owner: 'bob', sharedWith: [] },
};

const executed = [];

const sqliteMock = {
  execute: (sql, params) => {
    executed.push({ sql, params });
    return { changes: 1 };
  },
  query: (sql, params) => {
    // The only query the access guard runs. Params are positional: [...ids, userId, userId].
    if (!sql.includes('json_each(j.shared_with_user)') || !sql.includes('FROM listings l')) return [];
    const values = Array.isArray(params) ? params : [];
    const userId = values[values.length - 1];
    const ids = values.slice(0, -2);
    return ids
      .filter((id) => LISTINGS[id] && (LISTINGS[id].owner === userId || LISTINGS[id].sharedWith.includes(userId)))
      .map((id) => ({ id }));
  },
  withTransaction: (cb) => cb({ prepare: () => ({ run: () => ({ changes: 1 }) }) }),
};

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({ default: sqliteMock }));
vi.mock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));

const { filterListingIdsForUser, userCanAccessListing } = await import('../../lib/services/storage/listingsStorage.js');

describe('listing access control', () => {
  describe('filterListingIdsForUser', () => {
    it('keeps listings the user owns', () => {
      expect(filterListingIdsForUser(['mine-1', 'mine-2'], 'alice')).toEqual(['mine-1', 'mine-2']);
    });

    it('keeps listings from a job shared with the user', () => {
      expect(filterListingIdsForUser(['shared-with-me'], 'alice')).toEqual(['shared-with-me']);
    });

    it('drops listings belonging to someone else', () => {
      expect(filterListingIdsForUser(['someone-elses'], 'alice')).toEqual([]);
    });

    it('drops unknown ids', () => {
      expect(filterListingIdsForUser(['does-not-exist'], 'alice')).toEqual([]);
    });

    it('returns only the accessible part of a mixed batch', () => {
      expect(filterListingIdsForUser(['mine-1', 'someone-elses', 'mine-2'], 'alice')).toEqual(['mine-1', 'mine-2']);
    });

    it('lets an admin through without a query', () => {
      expect(filterListingIdsForUser(['someone-elses'], 'carol', true)).toEqual(['someone-elses']);
    });

    it('returns nothing without a user', () => {
      expect(filterListingIdsForUser(['mine-1'], null)).toEqual([]);
      expect(filterListingIdsForUser(['mine-1'], undefined)).toEqual([]);
    });

    it('handles empty and malformed input', () => {
      expect(filterListingIdsForUser([], 'alice')).toEqual([]);
      expect(filterListingIdsForUser(null, 'alice')).toEqual([]);
      expect(filterListingIdsForUser(['', null, 42], 'alice')).toEqual([]);
    });

    it('de-duplicates ids', () => {
      expect(filterListingIdsForUser(['mine-1', 'mine-1'], 'alice')).toEqual(['mine-1']);
    });

    it('chunks a batch larger than the SQLite parameter limit', () => {
      const ids = Array.from({ length: 1200 }, (_, i) => `bulk-${i}`);
      for (const id of ids) LISTINGS[id] = { owner: 'alice', sharedWith: [] };
      try {
        // 1200 ids at 500 per chunk is three statements, none anywhere near SQLITE_MAX_VARIABLE_NUMBER.
        expect(filterListingIdsForUser(ids, 'alice')).toHaveLength(1200);
      } finally {
        for (const id of ids) delete LISTINGS[id];
      }
    });
  });

  describe('userCanAccessListing', () => {
    it.each([
      ['mine-1', 'alice', false, true],
      ['shared-with-me', 'alice', false, true],
      ['someone-elses', 'alice', false, false],
      ['someone-elses', 'alice', true, true],
    ])('listing %s for %s (admin=%s) -> %s', (id, userId, isAdmin, expected) => {
      expect(userCanAccessListing(id, userId, isAdmin)).toBe(expected);
    });
  });

  describe('listingsRouter guards', () => {
    let routes;

    /**
     * Minimal fastify reply double.
     * @returns {{statusCode: number|null, payload: any, code: Function, send: Function}}
     */
    const makeReply = () => ({
      statusCode: null,
      payload: undefined,
      code(c) {
        this.statusCode = c;
        return this;
      },
      send(p) {
        this.payload = p;
        return this;
      },
    });

    const requestFor = (userId, body = {}, params = {}) => ({
      session: { currentUser: userId },
      body,
      params,
      query: {},
    });

    beforeEach(async () => {
      executed.length = 0;
      vi.resetModules();
      vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({ default: sqliteMock }));
      vi.doMock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
      vi.doMock('../../lib/api/security.js', () => ({ isAdmin: () => false }));
      vi.doMock('../../lib/services/storage/settingsStorage.js', () => ({
        getSettings: async () => ({ demoMode: false }),
        getUserSettings: () => ({}),
      }));
      vi.doMock('../../lib/services/storage/watchListStorage.js', () => ({
        toggleWatch: vi.fn(),
        ensureWatch: vi.fn(),
      }));
      vi.doMock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
      vi.doMock('../../lib/services/storage/jobStorage.js', () => ({ getJob: () => null }));

      const plugin = (await import('../../lib/api/routes/listingsRouter.js')).default;
      routes = {};
      await plugin({
        get: (path, handler) => (routes[`GET ${path}`] = handler),
        post: (path, handler) => (routes[`POST ${path}`] = handler),
        delete: (path, handler) => (routes[`DELETE ${path}`] = handler),
      });
    });

    it('rejects notes on a foreign listing', async () => {
      const reply = makeReply();
      await routes['POST /:listingId/notes'](
        requestFor('alice', { notes: 'mine now' }, { listingId: 'someone-elses' }),
        reply,
      );
      expect(reply.statusCode).toBe(403);
      expect(executed).toHaveLength(0);
    });

    it('allows notes on an own listing', async () => {
      const reply = makeReply();
      await routes['POST /:listingId/notes'](requestFor('alice', { notes: 'nice' }, { listingId: 'mine-1' }), reply);
      expect(reply.statusCode).toBeNull();
      expect(executed.some((c) => c.sql.includes('SET notes'))).toBe(true);
    });

    it('rejects a status change on a foreign listing', async () => {
      const reply = makeReply();
      await routes['POST /:listingId/status'](
        requestFor('alice', { status: 'rejected' }, { listingId: 'someone-elses' }),
        reply,
      );
      expect(reply.statusCode).toBe(403);
      expect(executed).toHaveLength(0);
    });

    it('rejects watching a foreign listing', async () => {
      const reply = makeReply();
      await routes['POST /watch'](requestFor('alice', { listingId: 'someone-elses' }), reply);
      expect(reply.statusCode).toBe(403);
    });

    it('rejects a batch delete that contains one foreign listing', async () => {
      const reply = makeReply();
      await routes['DELETE /'](requestFor('alice', { ids: ['mine-1', 'someone-elses'], hardDelete: true }), reply);
      // All-or-nothing: the own listing must survive too, because a hard delete cannot be undone.
      expect(reply.statusCode).toBe(403);
      expect(executed.some((c) => c.sql.includes('DELETE FROM listings'))).toBe(false);
    });

    it('allows a batch delete of only own listings', async () => {
      const reply = makeReply();
      await routes['DELETE /'](requestFor('alice', { ids: ['mine-1', 'mine-2'] }), reply);
      expect(reply.statusCode).toBeNull();
    });

    it('rejects a restore that contains a foreign listing', async () => {
      const reply = makeReply();
      await routes['POST /restore'](requestFor('alice', { ids: ['someone-elses'] }), reply);
      expect(reply.statusCode).toBe(403);
    });
  });
});
