/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Picking which of several candidate places is actually nearest.
 *
 * Both endpoints answer positionally - entry `i` is about destination `i` - which is what lets
 * several shortlists travel in one request and be split apart again by offset. Getting that
 * bookkeeping wrong would attribute one place type's travel time to another, silently, so it is
 * what most of these cases are about.
 */
const root = (await import('node:path')).resolve('.');
const servicePath = root + '/lib/services/transit/travelTimeService.js';
const clientPath = root + '/lib/services/transit/transitousClient.js';

const LAT = 52.517;
const LNG = 13.3888;
const REFERENCE = new Date(2026, 7, 4, 8, 0, 0).getTime();

let state;
let service;

const at = (n) => ({ lat: LAT + n / 1000, lng: LNG });

async function load() {
  vi.resetModules();
  vi.doMock(clientPath, () => ({
    fetchPlan: async () => null,
    fetchStreetRoute: async () => ({ answered: false, route: null }),
    fetchOneToMany: async (params) => {
      state.streetCalls.push(params);
      return state.streetAnswer;
    },
    fetchOneToManyIntermodal: async (params) => {
      state.transitCalls.push(params);
      return state.transitAnswer;
    },
  }));
  service = await import(servicePath);
}

beforeEach(async () => {
  state = {
    streetCalls: [],
    transitCalls: [],
    streetAnswer: null,
    transitAnswer: null,
  };
  await load();
});

describe('getPlaceMatrix', () => {
  it('picks the quickest candidate, not the nearest as the crow flies', async () => {
    // Candidate 0 is closer in a straight line; candidate 1 is quicker by road, which is what a
    // river or a railway does to a neighbourhood.
    state.streetAnswer = [
      { seconds: 900, meters: 1100 },
      { seconds: 420, meters: 600 },
    ];

    const result = await service.getPlaceMatrix({
      mode: 'walk',
      fromLat: LAT,
      fromLng: LNG,
      groups: [{ label: 'Groceries', candidates: [at(1), at(2)] }],
      referenceTime: REFERENCE,
    });

    expect(result.ok).toBe(true);
    expect(result.matches.get('Groceries')).toMatchObject({ index: 1, minutes: 7, distanceMeters: 600 });
  });

  it('splits one answer back across several place types by offset', async () => {
    state.streetAnswer = [
      { seconds: 900, meters: null },
      { seconds: 300, meters: null },
      { seconds: 1200, meters: null },
    ];

    const result = await service.getPlaceMatrix({
      mode: 'walk',
      fromLat: LAT,
      fromLng: LNG,
      groups: [
        { label: 'Groceries', candidates: [at(1), at(2)] },
        { label: 'Bread', candidates: [at(3)] },
      ],
      referenceTime: REFERENCE,
    });

    // One request for both, and each index is relative to its own group's list.
    expect(state.streetCalls).toHaveLength(1);
    expect(state.streetCalls[0].destinations).toHaveLength(3);
    expect(result.matches.get('Groceries')).toMatchObject({ index: 1, minutes: 5 });
    expect(result.matches.get('Bread')).toMatchObject({ index: 0, minutes: 20 });
  });

  it('reads the transit answer, and keeps the walk beside it', async () => {
    state.transitAnswer = [
      { street: { seconds: 465, meters: 568 }, transit: { seconds: 840, transfers: 0 } },
      { street: { seconds: null, meters: null }, transit: { seconds: 1920, transfers: 2 } },
    ];

    const result = await service.getPlaceMatrix({
      mode: 'transit',
      fromLat: LAT,
      fromLng: LNG,
      groups: [{ label: 'Gym', candidates: [at(1), at(2)] }],
      referenceTime: REFERENCE,
    });

    const match = result.matches.get('Gym');
    expect(match).toMatchObject({ index: 0, minutes: 14, transfers: 0 });
    // Worth having for free: for a place four streets away, walking is usually the better answer.
    expect(match.walk).toMatchObject({ minutes: 8, distanceMeters: 568 });
  });

  it('skips a candidate the router could not reach', async () => {
    // An unreachable destination comes back as an empty object rather than being omitted, which is
    // what keeps the positions aligned.
    state.streetAnswer = [
      { seconds: null, meters: null },
      { seconds: 600, meters: 800 },
    ];

    const result = await service.getPlaceMatrix({
      mode: 'walk',
      fromLat: LAT,
      fromLng: LNG,
      groups: [{ label: 'Groceries', candidates: [at(1), at(2)] }],
      referenceTime: REFERENCE,
    });

    expect(result.matches.get('Groceries').index).toBe(1);
  });

  it('leaves out a group nothing was routable for without failing the rest', async () => {
    state.streetAnswer = [
      { seconds: 600, meters: null },
      { seconds: null, meters: null },
    ];

    const result = await service.getPlaceMatrix({
      mode: 'walk',
      fromLat: LAT,
      fromLng: LNG,
      groups: [
        { label: 'Groceries', candidates: [at(1)] },
        { label: 'Bread', candidates: [at(2)] },
      ],
      referenceTime: REFERENCE,
    });

    // One village with no bakery must not cost the supermarket its answer.
    expect(result.ok).toBe(true);
    expect(result.matches.has('Groceries')).toBe(true);
    expect(result.matches.has('Bread')).toBe(false);
  });

  it('reports an outage differently from "there is no route"', async () => {
    state.streetAnswer = null;
    const outage = await service.getPlaceMatrix({
      mode: 'walk',
      fromLat: LAT,
      fromLng: LNG,
      groups: [{ label: 'Groceries', candidates: [at(1)] }],
      referenceTime: REFERENCE,
    });

    state.streetAnswer = [{ seconds: null, meters: null }];
    const unroutable = await service.getPlaceMatrix({
      mode: 'walk',
      fromLat: LAT,
      fromLng: LNG,
      groups: [{ label: 'Groceries', candidates: [at(1)] }],
      referenceTime: REFERENCE,
    });

    // The caller treats these opposite ways: one leaves the listing due, the other counts.
    expect(outage).toEqual({ ok: false, reason: 'unavailable' });
    expect(unroutable).toEqual({ ok: false, reason: 'unroutable' });
  });

  it('sends a departure only where one means anything', async () => {
    state.streetAnswer = [{ seconds: 600, meters: null }];
    await service.getPlaceMatrix({
      mode: 'bike',
      fromLat: LAT,
      fromLng: LNG,
      groups: [{ label: 'Gym', candidates: [at(1)] }],
      referenceTime: REFERENCE,
    });

    // A ride is a ride whenever you make it; only the timetable cares what time it is.
    expect(state.streetCalls[0].mode).toBe('BIKE');
    expect(state.streetCalls[0].time).toBeUndefined();
  });

  it('says "no route" rather than asking about an empty shortlist', async () => {
    const result = await service.getPlaceMatrix({
      mode: 'walk',
      fromLat: LAT,
      fromLng: LNG,
      groups: [{ label: 'Groceries', candidates: [] }],
      referenceTime: REFERENCE,
    });

    expect(result).toEqual({ ok: false, reason: 'unroutable' });
    expect(state.streetCalls).toHaveLength(0);
  });
});
