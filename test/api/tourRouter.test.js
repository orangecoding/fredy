/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TRACKING_POIS } from '../../lib/TRACKING_POIS.js';

const root = (await import('node:path')).resolve('.');

/** @type {string[]} */
let tracked;
/** @type {Array<[string, ...any[]]>} */
let calls;
/** @type {{status: string|null, offer: boolean}} */
let state;
/** @type {{demoMode: boolean}} */
let settings;
/** @type {{wasRunning: boolean, removed: boolean}} */
let finishResult;
/** @type {boolean} */
let devMode;

/**
 * Register the tour plugin against a fastify double, with the service replaced by a recorder.
 *
 * @returns {Promise<Record<string, (request: any, reply: any) => Promise<any>>>}
 */
async function loadRoutes() {
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({ getSettings: async () => settings }));
  vi.doMock(root + '/lib/utils.js', () => ({ getProviders: async () => ['providers'], inDevMode: () => devMode }));
  vi.doMock(root + '/lib/services/tracking/Tracker.js', () => ({ trackPoi: async (poi) => tracked.push(poi) }));
  vi.doMock(root + '/lib/services/tour/tourService.js', () => ({
    TOUR_OUTCOMES: ['completed', 'cancelled'],
    TOUR_STATUS: { RUNNING: 'running', COMPLETED: 'completed', CANCELLED: 'cancelled' },
    getTourState: async (userId) => {
      calls.push(['getTourState', userId]);
      return state;
    },
    startTour: (userId, providers) => {
      calls.push(['startTour', userId, providers]);
      return { jobId: `tour-${userId}`, listingId: 'listing-1' };
    },
    declineTour: (userId) => calls.push(['declineTour', userId]),
    resetTour: (userId) => calls.push(['resetTour', userId]),
    finishTour: (userId, outcome) => {
      calls.push(['finishTour', userId, outcome]);
      return finishResult;
    },
  }));

  const plugin = (await import(root + '/lib/api/routes/tourRouter.js')).default;
  const routes = {};
  await plugin({
    get: (path, handler) => (routes[`GET ${path}`] = handler),
    post: (path, handler) => (routes[`POST ${path}`] = handler),
  });
  return routes;
}

/** A reply double that records what the handler answered. */
function replyDouble() {
  const recorded = { status: 200, payload: undefined };
  return {
    recorded,
    code(status) {
      recorded.status = status;
      return this;
    },
    send(payload) {
      recorded.payload = payload;
      return recorded;
    },
  };
}

/**
 * Call one route as `user-1`.
 *
 * @param {string} route
 * @param {Record<string, any>} [body]
 * @returns {Promise<{status: number, result: any}>}
 */
async function call(route, body = {}) {
  const routes = await loadRoutes();
  const reply = replyDouble();
  const result = await routes[route]({ session: { currentUser: 'user-1' }, body }, reply);
  return { status: reply.recorded.status, result };
}

beforeEach(() => {
  tracked = [];
  calls = [];
  state = { status: null, offer: true };
  settings = { demoMode: false };
  finishResult = { wasRunning: true, removed: true };
  devMode = false;
});

describe('POST /api/tour/reset', () => {
  it('is announced to the browser only in development', async () => {
    devMode = true;
    expect((await call('GET /')).result.canReset).toBe(true);
  });

  it('forgets the signed-in account answer in development', async () => {
    devMode = true;
    const { result } = await call('POST /reset');
    expect(result).toEqual({ success: true });
    expect(calls).toEqual([['resetTour', 'user-1']]);
  });

  it('does not exist in production', async () => {
    const { status } = await call('POST /reset');
    expect(status).toBe(404);
    expect(calls).toEqual([]);
  });
});

describe('GET /api/tour', () => {
  it('answers for the signed-in user', async () => {
    const { result } = await call('GET /');
    expect(result).toEqual({ ...state, canReset: false });
    expect(calls).toEqual([['getTourState', 'user-1']]);
  });
});

describe('POST /api/tour/start', () => {
  it('seeds the tour and reports that it was accepted', async () => {
    const { status, result } = await call('POST /start');
    expect(status).toBe(200);
    expect(result).toEqual({ jobId: 'tour-user-1', listingId: 'listing-1' });
    expect(calls).toContainEqual(['startTour', 'user-1', ['providers']]);
    expect(tracked).toEqual([TRACKING_POIS.TOUR_ACCEPTED]);
  });

  it('restarts a running tour without counting a second acceptance', async () => {
    state = { status: 'running', offer: false };
    const { status } = await call('POST /start');
    expect(status).toBe(200);
    expect(tracked).toEqual([]);
  });

  it('refuses an account that already answered, so nothing can be seeded into it again', async () => {
    state = { status: 'declined', offer: false };
    const { status } = await call('POST /start');
    expect(status).toBe(409);
    expect(calls.some(([name]) => name === 'startTour')).toBe(false);
  });

  it('refuses on a demo instance', async () => {
    settings.demoMode = true;
    const { status } = await call('POST /start');
    expect(status).toBe(403);
    expect(calls.some(([name]) => name === 'startTour')).toBe(false);
  });
});

describe('POST /api/tour/decline', () => {
  it('remembers the answer and reports it', async () => {
    const { result } = await call('POST /decline');
    expect(result).toEqual({ success: true });
    expect(calls).toContainEqual(['declineTour', 'user-1']);
    expect(tracked).toEqual([TRACKING_POIS.TOUR_DECLINED]);
  });

  it('refuses when there is no open question', async () => {
    state = { status: 'completed', offer: false };
    const { status } = await call('POST /decline');
    expect(status).toBe(409);
    expect(tracked).toEqual([]);
  });
});

describe('POST /api/tour/finish', () => {
  it.each([
    ['completed', TRACKING_POIS.TOUR_COMPLETED],
    ['cancelled', TRACKING_POIS.TOUR_CANCELLED],
  ])('ends a running tour as %s and reports it', async (outcome, poi) => {
    const { result } = await call('POST /finish', { outcome });
    expect(result).toEqual({ success: true });
    expect(calls).toEqual([['finishTour', 'user-1', outcome]]);
    expect(tracked).toEqual([poi]);
  });

  it('still cleans up for a tour that is no longer running, but counts nothing', async () => {
    finishResult = { wasRunning: false, removed: false };
    const { result } = await call('POST /finish', { outcome: 'cancelled' });
    expect(result).toEqual({ success: true });
    expect(calls).toEqual([['finishTour', 'user-1', 'cancelled']]);
    expect(tracked).toEqual([]);
  });

  it.each([[undefined], ['exploded'], [42]])('rejects the outcome %s', async (outcome) => {
    const { status } = await call('POST /finish', { outcome });
    expect(status).toBe(400);
    expect(calls).toEqual([]);
  });
});
