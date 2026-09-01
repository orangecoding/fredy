/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * How Fredy behaves towards Overpass, which is a donated public service with no API key.
 *
 * The same contract as the Nominatim client, and checked the same way: the curve directly rather
 * than by advancing a clock, because the calls it guards run behind a throttle whose own timer stops
 * when the timers are faked, deadlocking the test rather than failing it.
 */
const root = (await import('node:path')).resolve('.');
const clientPath = root + '/lib/services/poi/overpassClient.js';
const settingsPath = root + '/lib/services/storage/settingsStorage.js';
const loggerPath = root + '/lib/services/logger.js';

let responses;
let requests;
let client;

/**
 * @param {number} status
 * @param {unknown} [body]
 * @returns {Object}
 */
const answer = (status, body = { elements: [] }) => ({
  status,
  ok: status >= 200 && status < 300,
  statusText: String(status),
  json: async () => body,
});

const node = (overrides = {}) => ({ type: 'node', lat: 52.5, lon: 13.4, tags: { name: 'Edeka' }, ...overrides });

/**
 * The query as it was actually written.
 *
 * The body is form-encoded, so spaces arrive as `+` and `decodeURIComponent` alone leaves them.
 *
 * @param {string} body
 * @returns {string}
 */
const queryOf = (body) => decodeURIComponent(body.replace(/\+/g, ' '));

beforeEach(async () => {
  vi.resetModules();
  responses = [];
  requests = [];
  vi.doMock('node-fetch', () => ({
    default: async (url, options) => {
      requests.push({ url, body: String(options?.body ?? '') });
      return responses.shift() ?? answer(200);
    },
  }));
  vi.doMock(settingsPath, () => ({ getSettings: async () => ({}) }));
  vi.doMock(loggerPath, () => ({ default: { debug: () => {}, warn: () => {}, error: () => {}, info: () => {} } }));
  client = await import(clientPath);
  client.__resetRateLimit();
});

describe('the Overpass stand-off', () => {
  it('starts at a minute rather than an hour', () => {
    expect(client.backoffFor(1)).toBe(60_000);
  });

  it('doubles per consecutive refusal', () => {
    expect(client.backoffFor(2)).toBe(120_000);
    expect(client.backoffFor(3)).toBe(240_000);
  });

  it('never exceeds an hour', () => {
    expect(client.backoffFor(9)).toBe(3_600_000);
  });

  it('treats a gateway timeout as a refusal, not as an error', async () => {
    // 504 is how Overpass says "your query did not get a slot", which means the same thing to us as
    // a rate limit: stop asking for a while.
    responses = [answer(504)];
    const result = await client.findPlaces({ category: 'supermarket', lat: 52.5, lng: 13.4, radiusMeters: 1000 });

    expect(result).toBeNull();
    expect(client.isOverpassPaused()).toBe(true);
    expect(client.__consecutiveRefusals()).toBe(1);
  });

  it('makes no request at all while it is standing off', async () => {
    responses = [answer(429)];
    await client.findPlaces({ category: 'supermarket', lat: 52.5, lng: 13.4, radiusMeters: 1000 });
    const after = requests.length;

    await client.findPlaces({ category: 'supermarket', lat: 52.5, lng: 13.4, radiusMeters: 1000 });

    expect(requests).toHaveLength(after);
  });

  it('clears the escalation as soon as it is answered', async () => {
    responses = [answer(429)];
    await client.findPlaces({ category: 'supermarket', lat: 52.5, lng: 13.4, radiusMeters: 1000 });
    client.__clearBackoff();

    responses = [answer(200, { elements: [node()] })];
    await client.findPlaces({ category: 'supermarket', lat: 52.5, lng: 13.4, radiusMeters: 1000 });

    expect(client.__consecutiveRefusals()).toBe(0);
  });
});

describe('the query', () => {
  it('asks for nodes, ways and relations together', async () => {
    responses = [answer(200, { elements: [] })];
    await client.findPlaces({ category: 'supermarket', lat: 52.5, lng: 13.4, radiusMeters: 1500 });

    // A supermarket is a point in one town and a building outline in the next; asking only for
    // nodes would quietly miss half of them.
    expect(queryOf(requests[0].body)).toContain('nwr["shop"="supermarket"](around:1500,52.5,13.4)');
    expect(queryOf(requests[0].body)).toContain('out center');
  });

  it('asks for every tagging a category is known by', async () => {
    responses = [answer(200, { elements: [] })];
    await client.findPlaces({ category: 'gym', lat: 52.5, lng: 13.4, radiusMeters: 1000 });

    const body = queryOf(requests[0].body);
    expect(body).toContain('leisure"="fitness_centre');
    expect(body).toContain('amenity"="gym');
  });
});

describe('the answer', () => {
  it('collapses a way to its centre', async () => {
    responses = [
      answer(200, {
        elements: [{ type: 'way', center: { lat: 52.51, lon: 13.41 }, tags: { name: 'Rewe' } }],
      }),
    ];
    const places = await client.findPlaces({ category: 'supermarket', lat: 52.5, lng: 13.4, radiusMeters: 1000 });

    expect(places).toEqual([{ name: 'Rewe', lat: 52.51, lng: 13.41 }]);
  });

  it('keeps a place that has no name', async () => {
    responses = [answer(200, { elements: [node({ tags: {} })] })];
    const places = await client.findPlaces({ category: 'supermarket', lat: 52.5, lng: 13.4, radiusMeters: 1000 });

    // An unnamed supermarket is still a supermarket, and may well be the nearest one.
    expect(places).toEqual([{ name: '', lat: 52.5, lng: 13.4 }]);
  });

  it('falls back to the brand when there is no name', async () => {
    responses = [answer(200, { elements: [node({ tags: { brand: 'Lidl' } })] })];
    const places = await client.findPlaces({ category: 'supermarket', lat: 52.5, lng: 13.4, radiusMeters: 1000 });

    expect(places[0].name).toBe('Lidl');
  });

  it('tells an empty answer apart from a failed one', async () => {
    responses = [answer(200, { elements: [] })];
    const empty = await client.findPlaces({ category: 'supermarket', lat: 52.5, lng: 13.4, radiusMeters: 1000 });

    // The distinction the cache depends on: an empty array is cached as "nothing here", a null is
    // not cached at all.
    expect(empty).toEqual([]);
    expect(empty).not.toBeNull();
  });

  it('drops an element with no usable coordinate rather than storing NaN', async () => {
    responses = [answer(200, { elements: [{ type: 'relation', tags: { name: 'Somewhere' } }, node()] })];
    const places = await client.findPlaces({ category: 'supermarket', lat: 52.5, lng: 13.4, radiusMeters: 1000 });

    expect(places).toHaveLength(1);
  });
});
