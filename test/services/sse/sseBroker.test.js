/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

/**
 * SSE connections are long-lived, and behind a proxy they frequently go away without ever emitting
 * a 'close' event. The broker used to swallow the resulting write errors and keep the response in
 * its map forever, writing a heartbeat to it every 25 seconds for the life of the process.
 */
describe('sse broker', () => {
  let broker;

  beforeEach(async () => {
    vi.resetModules();
    broker = await import('../../../lib/services/sse/sse-broker.js');
  });

  /**
   * Minimal ServerResponse double.
   * @param {{failWrites?: boolean, ended?: boolean, destroyed?: boolean}} [opts]
   */
  const makeRes = ({ failWrites = false, ended = false, destroyed = false } = {}) => ({
    written: [],
    writableEnded: ended,
    destroyed,
    write(chunk) {
      if (failWrites) throw new Error('EPIPE');
      this.written.push(chunk);
      return true;
    },
  });

  it('registers a client and greets it', () => {
    const res = makeRes();
    broker.addClient('u1', res);
    expect(broker.connectionCount()).toBe(1);
    expect(res.written.join('')).toContain('event: hello');
  });

  it('delivers an event to every connection of a user', () => {
    const first = makeRes();
    const second = makeRes();
    broker.addClient('u1', first);
    broker.addClient('u1', second);

    broker.sendToUser('u1', 'listings:new', { count: 2 });

    for (const res of [first, second]) {
      expect(res.written.join('')).toContain('"count":2');
    }
  });

  it('does not deliver another user’s events', () => {
    const mine = makeRes();
    broker.addClient('u1', mine);
    broker.sendToUser('u2', 'listings:new', { count: 1 });
    expect(mine.written.join('')).not.toContain('listings:new');
  });

  it('removes a client on close', () => {
    const res = makeRes();
    broker.addClient('u1', res);
    broker.removeClient('u1', res);
    expect(broker.connectionCount()).toBe(0);
  });

  it('drops a connection whose write fails, instead of keeping it forever', () => {
    const dead = makeRes({ failWrites: true });
    const alive = makeRes();
    broker.addClient('u1', dead);
    broker.addClient('u1', alive);

    broker.sendToUser('u1', 'listings:new', { count: 1 });

    expect(broker.connectionCount()).toBe(1);
    expect(alive.written.join('')).toContain('"count":1');
  });

  it('skips a response that already ended', () => {
    const ended = makeRes({ ended: true });
    broker.addClient('u1', ended);
    // addClient's hello is skipped too - there is nothing to greet.
    broker.sendToUser('u1', 'listings:new', { count: 1 });
    expect(ended.written).toHaveLength(0);
  });

  describe('heartbeat', () => {
    it('pings live connections', () => {
      const res = makeRes();
      broker.addClient('u1', res);
      broker.heartbeat();
      expect(res.written.join('')).toContain(': ping');
    });

    it('reaps connections that went away without a close event', () => {
      broker.addClient('u1', makeRes({ failWrites: true }));
      broker.addClient('u1', makeRes({ destroyed: true }));
      const alive = makeRes();
      broker.addClient('u2', alive);

      expect(broker.heartbeat()).toBe(2);
      expect(broker.connectionCount()).toBe(1);
    });

    it('forgets a user once their last connection is gone', () => {
      broker.addClient('u1', makeRes({ failWrites: true }));
      broker.heartbeat();
      // Nothing left to send to, and no empty set lingering behind either.
      expect(broker.connectionCount()).toBe(0);
      expect(() => broker.sendToUser('u1', 'listings:new', {})).not.toThrow();
    });
  });

  it('broadcasts to several users, de-duplicating the list', () => {
    const first = makeRes();
    const second = makeRes();
    broker.addClient('u1', first);
    broker.addClient('u2', second);

    broker.sendToUsers(['u1', 'u2', 'u1'], 'jobStatus', { running: true });

    expect(first.written.filter((c) => c.includes('jobStatus'))).toHaveLength(1);
    expect(second.written.filter((c) => c.includes('jobStatus'))).toHaveLength(1);
  });
});
