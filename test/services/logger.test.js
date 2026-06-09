/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';

describe('services/logger.js - debug log sink', () => {
  let logger;
  let setDebugLogSink;
  let consoleSpies;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import(path.resolve('lib/services/logger.js'));
    logger = mod.default;
    setDebugLogSink = mod.setDebugLogSink;

    // Silence console output so test runner stdout stays readable while still
    // letting us inspect what the logger emitted if a test wants to.
    consoleSpies = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    setDebugLogSink(null);
    for (const spy of Object.values(consoleSpies)) spy.mockRestore();
  });

  it('is a no-op for the sink when none is registered', () => {
    // Just make sure nothing throws.
    expect(() => logger.info('hello')).not.toThrow();
    expect(() => logger.error(new Error('boom'))).not.toThrow();
  });

  it('forwards every log level (including debug) to the registered sink', () => {
    const captured = [];
    setDebugLogSink((entry) => captured.push(entry));

    logger.debug('debug-line');
    logger.info('info-line');
    logger.warn('warn-line');
    logger.error('error-line');

    expect(captured).toHaveLength(4);
    expect(captured.map((c) => c.level)).toEqual(['debug', 'info', 'warn', 'error']);
    expect(captured[0].message).toContain('debug-line');
    expect(captured[1].message).toContain('info-line');
    expect(captured[2].message).toContain('warn-line');
    expect(captured[3].message).toContain('error-line');
    for (const c of captured) {
      expect(typeof c.ts).toBe('number');
    }
  });

  it('serializes Error stacks for the sink instead of "[object Object]"', () => {
    const captured = [];
    setDebugLogSink((entry) => captured.push(entry));

    logger.error(new Error('boom'));

    expect(captured).toHaveLength(1);
    expect(captured[0].message).toContain('Error: boom');
  });

  it('stops forwarding once the sink is unregistered', () => {
    const captured = [];
    setDebugLogSink((entry) => captured.push(entry));
    logger.info('one');
    setDebugLogSink(null);
    logger.info('two');

    expect(captured).toHaveLength(1);
    expect(captured[0].message).toContain('one');
  });

  it('does not break the caller when the sink throws', () => {
    setDebugLogSink(() => {
      throw new Error('sink exploded');
    });
    expect(() => logger.info('still works')).not.toThrow();
    expect(consoleSpies.info).toHaveBeenCalled();
  });
});
