/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { TOUR_FINISH_URL, TOUR_OUTCOME, sendTourCancelBeacon } from '../../ui/src/services/tour/tourClient.js';

/**
 * The beacon is the one way a closed tab gets its example data removed right away. Everything else
 * about it is the browser's business, so what is checked here is what it sends and that it never
 * throws out of a `pagehide` handler.
 */
describe('tour cancel beacon', () => {
  it('posts a cancellation to the finish endpoint as JSON', async () => {
    const sent = [];
    const accepted = sendTourCancelBeacon({ sendBeacon: (url, body) => sent.push({ url, body }) > 0 });

    expect(accepted).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(TOUR_FINISH_URL);
    expect(sent[0].body.type).toBe('application/json');
    expect(JSON.parse(await sent[0].body.text())).toEqual({ outcome: TOUR_OUTCOME.CANCELLED });
  });

  it('reports a browser without beacons instead of failing', () => {
    expect(sendTourCancelBeacon({})).toBe(false);
    expect(sendTourCancelBeacon(undefined)).toBe(false);
  });

  it('swallows a browser that throws, since it runs while the page is going away', () => {
    const throwing = {
      sendBeacon: () => {
        throw new Error('nope');
      },
    };
    expect(sendTourCancelBeacon(throwing)).toBe(false);
  });
});
