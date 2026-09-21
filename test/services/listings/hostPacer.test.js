/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';
import { createHostPacer } from '../../../lib/services/listings/hostPacer.js';

/**
 * The alive-checker runs four probes at a time, and a run is usually four probes at the *same*
 * portal, because listings arrive in batches per provider. That is what produced eight requests a
 * second at one host and a page of HTTP 429s. The pacer is what keeps the concurrency for throughput
 * across portals while leaving each single portal a queue of one.
 */
describe('services/listings/hostPacer', () => {
  /** A clock the test moves by hand, so no test waits on a real timer. */
  const fakeClock = () => {
    let current = 0;
    return {
      now: () => current,
      sleep: vi.fn(async (ms) => {
        current += ms;
      }),
      advance: (ms) => {
        current += ms;
      },
    };
  };

  const deferred = () => {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    return { promise, resolve };
  };

  it('runs one request at a time per host', async () => {
    const clock = fakeClock();
    const pace = createHostPacer({ minGapMs: 0, now: clock.now, sleep: clock.sleep });
    const first = deferred();
    let secondStarted = false;

    const firstRun = pace('https://www.immobilienscout24.de/expose/1', () => first.promise);
    const secondRun = pace('https://www.immobilienscout24.de/expose/2', async () => {
      secondStarted = true;
    });

    await Promise.resolve();
    expect(secondStarted).toBe(false);

    first.resolve();
    await Promise.all([firstRun, secondRun]);
    expect(secondStarted).toBe(true);
  });

  it('lets different hosts run at the same time', async () => {
    const clock = fakeClock();
    const pace = createHostPacer({ minGapMs: 0, now: clock.now, sleep: clock.sleep });
    const blocked = deferred();
    let otherStarted = false;

    const blockedRun = pace('https://www.immobilienscout24.de/expose/1', () => blocked.promise);
    const otherRun = pace('https://www.immowelt.de/expose/1', async () => {
      otherStarted = true;
    });

    await otherRun;
    // Concurrency across portals is the whole point of running four at a time - only the per-host
    // burst was ever the problem.
    expect(otherStarted).toBe(true);

    blocked.resolve();
    await blockedRun;
  });

  it('leaves a minimum gap between two requests at the same host', async () => {
    const clock = fakeClock();
    const pace = createHostPacer({ minGapMs: 400, now: clock.now, sleep: clock.sleep });

    await pace('https://www.immobilienscout24.de/expose/1', async () => {});
    await pace('https://www.immobilienscout24.de/expose/2', async () => {});

    expect(clock.sleep).toHaveBeenCalledWith(400);
  });

  it('does not wait when the previous request at that host already took long enough', async () => {
    const clock = fakeClock();
    const pace = createHostPacer({ minGapMs: 400, now: clock.now, sleep: clock.sleep });

    await pace('https://www.immobilienscout24.de/expose/1', async () => clock.advance(900));
    await pace('https://www.immobilienscout24.de/expose/2', async () => {});

    // The gap is a floor on the request rate, not a tax on top of a slow portal.
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it('keeps the queue moving when a request throws', async () => {
    const clock = fakeClock();
    const pace = createHostPacer({ minGapMs: 0, now: clock.now, sleep: clock.sleep });
    let secondRan = false;

    // A rejected probe must reach its caller and must not take the rest of the host's queue with it.
    await expect(
      pace('https://www.immobilienscout24.de/expose/1', async () => {
        throw new Error('ECONNRESET');
      }),
    ).rejects.toThrow('ECONNRESET');
    await pace('https://www.immobilienscout24.de/expose/2', async () => {
      secondRan = true;
    });

    expect(secondRan).toBe(true);
  });

  it('hands back what the request returned', async () => {
    const pace = createHostPacer({ minGapMs: 0 });
    await expect(pace('https://www.immowelt.de/expose/1', async () => 1)).resolves.toBe(1);
  });

  it('queues links it cannot read a host from together', async () => {
    const clock = fakeClock();
    const pace = createHostPacer({ minGapMs: 400, now: clock.now, sleep: clock.sleep });

    await pace('not-a-url', async () => {});
    await pace(null, async () => {});

    // Unknown is a bucket of its own rather than a free pass - a link the checker cannot parse is
    // still a request going somewhere.
    expect(clock.sleep).toHaveBeenCalledWith(400);
  });
});
