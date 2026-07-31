/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/services/transit/transitService.js', () => ({
  getNearbyStops: vi.fn(),
  getDepartures: vi.fn(),
}));
vi.mock('../../lib/services/logger.js', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { getNearbyStops, getDepartures } from '../../lib/services/transit/transitService.js';
import transitPlugin from '../../lib/api/routes/transitRoute.js';

const STOP = { id: 'near', name: 'U Unter den Linden (Berlin)', lat: 52.516994, lng: 13.388876, distance: 12 };

/**
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function buildApp() {
  const app = Fastify();
  await app.register(transitPlugin, { prefix: '/api/transit' });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('transit route', () => {
  describe('GET /stops/nearby', () => {
    it('returns the stops around a coordinate', async () => {
      getNearbyStops.mockResolvedValue([STOP]);
      const app = await buildApp();

      const response = await app.inject({ method: 'GET', url: '/api/transit/stops/nearby?lat=52.517&lng=13.3888' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ stops: [STOP] });
      expect(getNearbyStops).toHaveBeenCalledWith(52.517, 13.3888, 3);
    });

    it('clamps the limit into a sane range', async () => {
      getNearbyStops.mockResolvedValue([]);
      const app = await buildApp();

      await app.inject({ method: 'GET', url: '/api/transit/stops/nearby?lat=52.5&lng=13.4&limit=99' });
      expect(getNearbyStops).toHaveBeenCalledWith(52.5, 13.4, 10);

      await app.inject({ method: 'GET', url: '/api/transit/stops/nearby?lat=52.5&lng=13.4&limit=nonsense' });
      expect(getNearbyStops).toHaveBeenLastCalledWith(52.5, 13.4, 3);
    });

    it.each([
      ['missing coordinates', '/api/transit/stops/nearby'],
      ['a missing longitude', '/api/transit/stops/nearby?lat=52.5'],
      ['an unparseable latitude', '/api/transit/stops/nearby?lat=north&lng=13.4'],
      ['an out-of-range latitude', '/api/transit/stops/nearby?lat=91&lng=13.4'],
      ['an out-of-range longitude', '/api/transit/stops/nearby?lat=52.5&lng=181'],
    ])('answers 400 for %s', async (_case, url) => {
      const app = await buildApp();

      const response = await app.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(400);
      expect(getNearbyStops).not.toHaveBeenCalled();
    });

    it('answers 502 when the lookup throws', async () => {
      getNearbyStops.mockRejectedValue(new Error('upstream is down'));
      const app = await buildApp();

      const response = await app.inject({ method: 'GET', url: '/api/transit/stops/nearby?lat=52.5&lng=13.4' });

      expect(response.statusCode).toBe(502);
    });
  });

  describe('GET /departures', () => {
    it('passes a stop id straight through', async () => {
      getDepartures.mockResolvedValue({ stop: STOP, departures: [] });
      const app = await buildApp();

      const response = await app.inject({ method: 'GET', url: '/api/transit/departures?stopId=near&limit=4' });

      expect(response.statusCode).toBe(200);
      expect(getDepartures).toHaveBeenCalledWith({
        stopId: 'near',
        lat: null,
        lng: null,
        name: undefined,
        limit: 4,
      });
    });

    it('accepts coordinates plus a name instead of an id', async () => {
      getDepartures.mockResolvedValue({ stop: STOP, departures: [] });
      const app = await buildApp();

      await app.inject({
        method: 'GET',
        url: '/api/transit/departures?lat=52.517&lng=13.3888&name=U%20Unter%20den%20Linden',
      });

      expect(getDepartures).toHaveBeenCalledWith({
        stopId: undefined,
        lat: 52.517,
        lng: 13.3888,
        name: 'U Unter den Linden',
        limit: 8,
      });
    });

    it('answers 400 without an id and without coordinates', async () => {
      const app = await buildApp();

      const response = await app.inject({ method: 'GET', url: '/api/transit/departures?name=Somewhere' });

      expect(response.statusCode).toBe(400);
      expect(getDepartures).not.toHaveBeenCalled();
    });

    it('answers 502 when no board could be built', async () => {
      getDepartures.mockResolvedValue(null);
      const app = await buildApp();

      const response = await app.inject({ method: 'GET', url: '/api/transit/departures?stopId=near' });

      expect(response.statusCode).toBe(502);
      expect(response.json().error).toBe('No departures available');
    });
  });
});
