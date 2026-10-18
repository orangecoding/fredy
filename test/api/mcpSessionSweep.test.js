/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sweepSessions, _sessions } = await import('../../lib/mcp/mcpHttpRoute.js');

const entry = (userId, lastSeen) => ({ userId, lastSeen, transport: { close: vi.fn(async () => {}) } });

describe('MCP session sweep', () => {
  beforeEach(() => _sessions.clear());

  // Remote connectors open a new session on every reconnect and rarely close one; each holds a full
  // server instance, and they piled up until the next restart.
  it('closes a session nobody has used for half an hour', () => {
    const now = 10 * 60 * 60 * 1000;
    const stale = entry('u1', now - 31 * 60 * 1000);
    const fresh = entry('u1', now - 5 * 60 * 1000);
    _sessions.set('stale', stale);
    _sessions.set('fresh', fresh);

    sweepSessions(now);

    expect([..._sessions.keys()]).toEqual(['fresh']);
    expect(stale.transport.close).toHaveBeenCalled();
  });

  it('keeps at most twenty per user, closing the oldest first', () => {
    const now = 10 * 60 * 60 * 1000;
    for (let i = 0; i < 22; i++) _sessions.set(`s${i}`, entry('u1', now - (22 - i) * 1000));
    _sessions.set('other', entry('u2', now - 50_000));

    sweepSessions(now);

    expect(_sessions.has('s0')).toBe(false);
    expect(_sessions.has('s1')).toBe(false);
    expect(_sessions.has('s2')).toBe(true);
    expect(_sessions.has('other')).toBe(true);
    expect(_sessions.size).toBe(21);
  });
});
