/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

import { subscribeJobEvents } from '../../ui/src/services/sse/jobEvents.js';

/** A stand-in for EventSource that records what was asked of it. */
const fakeSource = () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn() });

describe('the shared job event stream', () => {
  // Three listeners used to open three connections to the same endpoint; over HTTP/1.1 a few tabs
  // used up every connection the browser allows for the host.
  it('opens one stream for every listener and closes it after the last one leaves', () => {
    const source = fakeSource();
    const open = vi.fn(() => source);

    const stopA = subscribeJobEvents('jobStatus', () => {}, open);
    const stopB = subscribeJobEvents('listings:new', () => {}, open);
    expect(open).toHaveBeenCalledTimes(1);
    expect(source.addEventListener).toHaveBeenCalledTimes(2);

    stopA();
    expect(source.close).not.toHaveBeenCalled();
    stopB();
    expect(source.close).toHaveBeenCalledTimes(1);
  });

  it('opens a fresh stream for a listener that comes after it was closed, and ignores a second stop', () => {
    const first = fakeSource();
    const second = fakeSource();
    const stop = subscribeJobEvents(
      'jobStatus',
      () => {},
      () => first,
    );
    stop();
    stop();
    expect(first.close).toHaveBeenCalledTimes(1);

    const stopAgain = subscribeJobEvents(
      'jobStatus',
      () => {},
      () => second,
    );
    expect(second.addEventListener).toHaveBeenCalledTimes(1);
    stopAgain();
  });
});
