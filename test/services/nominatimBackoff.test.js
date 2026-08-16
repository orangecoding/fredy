/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * How long Fredy leaves Nominatim alone after being refused.
 *
 * A single 429 used to silence every geocode for an hour, which is why a listing found during a busy
 * run could sit with no coordinates until the next six-hourly sweep (issue #418). The wait now starts
 * small and escalates, so a burst costs a minute and a real ban still backs off just as far.
 *
 * The curve is checked directly rather than by advancing a clock: the calls it guards run behind a
 * one-per-second throttle whose own timer stops when the timers are faked, which deadlocks the test
 * rather than failing it.
 */
const root = (await import('node:path')).resolve('.');
const clientPath = root + '/lib/services/geocoding/client/nominatimClient.js';

let responses;
let requests;
let client;

/**
 * @param {number} status
 * @param {unknown} [body]
 * @returns {Object}
 */
const answer = (status, body = []) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

beforeEach(async () => {
  vi.resetModules();
  responses = [];
  requests = 0;
  vi.doMock('node-fetch', () => ({
    default: async () => {
      requests += 1;
      return responses.shift() ?? answer(200);
    },
  }));
  client = await import(clientPath);
  client.__resetRateLimit();
});

describe('the Nominatim stand-off', () => {
  describe('the curve', () => {
    it('starts at a minute rather than an hour', () => {
      expect(client.backoffFor(1)).toBe(60_000);
    });

    it('doubles per consecutive refusal', () => {
      expect(client.backoffFor(2)).toBe(120_000);
      expect(client.backoffFor(3)).toBe(240_000);
      expect(client.backoffFor(4)).toBe(480_000);
    });

    it('never exceeds the hour it used to wait flat', () => {
      expect(client.backoffFor(7)).toBe(3_600_000);
      expect(client.backoffFor(50)).toBe(3_600_000);
      // 2 ** 5000 is Infinity, and Math.min still has to answer with the cap.
      expect(client.backoffFor(5000)).toBe(3_600_000);
    });
  });

  describe('the state around it', () => {
    it('is not paused until something refuses', () => {
      expect(client.isPaused()).toBe(false);
    });

    it('pauses on a refusal', async () => {
      responses = [answer(429)];
      expect(await client.geocode('somewhere')).toBeNull();
      expect(client.isPaused()).toBe(true);
    });

    it('makes no request at all while it is standing off', async () => {
      responses = [answer(429)];
      await client.geocode('somewhere');
      const afterRefusal = requests;

      expect(await client.geocode('somewhere')).toBeNull();
      expect(await client.autocomplete('somewhere')).toEqual([]);
      expect(requests).toBe(afterRefusal);
    });

    it('does not pause when Nominatim simply found nothing', async () => {
      responses = [answer(200, [])];
      expect(await client.geocode('nowhere')).toEqual({ lat: -1, lng: -1 });
      expect(client.isPaused()).toBe(false);
    });

    /**
     * Service came back, so the next refusal is a fresh blip rather than a continuation. Without
     * this the count would only ever climb and every instance would end up permanently at an hour.
     */
    it('starts the escalation over once Nominatim answers again', async () => {
      responses = [answer(200, [])];
      await client.geocode('somewhere');
      client.__resetRateLimit();

      responses = [answer(429), answer(200, []), answer(429)];
      await client.geocode('a');
      const first = client.__consecutiveRefusals();
      client.__clearBackoff();
      await client.geocode('b');
      await client.geocode('c');

      expect(first).toBe(1);
      expect(client.__consecutiveRefusals()).toBe(1);
    });
  });
});
