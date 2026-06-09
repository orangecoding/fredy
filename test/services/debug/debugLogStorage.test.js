/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Wire up an in-memory better-sqlite3 instance plus a stubbed settings module so the
 * storage module under test can exercise real SQL while the rest of the dependency
 * graph stays inert.
 */
async function bootstrap() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE debug_logs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      ts        INTEGER NOT NULL,
      level     TEXT    NOT NULL,
      message   TEXT    NOT NULL,
      byte_size INTEGER NOT NULL
    );
  `);

  const settings = { debug_logging_enabled: false, debug_logging_ever_enabled: false };

  const ROOT = path.resolve('.');
  const sqlitePath = path.join(ROOT, 'lib', 'services', 'storage', 'SqliteConnection.js');
  const settingsPath = path.join(ROOT, 'lib', 'services', 'storage', 'settingsStorage.js');

  const sqliteMock = {
    default: {
      getConnection: () => db,
      execute: (sql, params = {}) => db.prepare(sql).run(params),
      query: (sql, params = {}) => db.prepare(sql).all(params),
    },
  };

  const settingsMock = {
    getSettings: async () => ({ ...settings }),
    upsertSettings: (entries) => {
      const map = Array.isArray(entries) ? Object.fromEntries(entries) : entries;
      for (const [k, v] of Object.entries(map)) {
        settings[k] = v;
      }
    },
  };

  vi.resetModules();
  vi.doMock(sqlitePath, () => sqliteMock);
  vi.doMock(settingsPath, () => settingsMock);

  const storage = await import(path.join(ROOT, 'lib', 'services', 'debug', 'debugLogStorage.js'));
  storage._resetForTests();
  return { storage, db, settings };
}

describe('services/debug/debugLogStorage.js', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await bootstrap();
  });

  afterEach(() => {
    try {
      ctx.db.close();
    } catch {
      // ignore
    }
  });

  it('isEnabled is false before enableDebugLogging is called', async () => {
    expect(ctx.storage.isEnabled()).toBe(false);
  });

  it('enableDebugLogging flips the cached flag and persists ever-enabled', async () => {
    await ctx.storage.enableDebugLogging();
    expect(ctx.storage.isEnabled()).toBe(true);
    expect(ctx.settings.debug_logging_enabled).toBe(true);
    expect(ctx.settings.debug_logging_ever_enabled).toBe(true);
  });

  it('reloadEnabledFromSettings picks up persisted state after restart', async () => {
    ctx.settings.debug_logging_enabled = true;
    const enabled = await ctx.storage.reloadEnabledFromSettings();
    expect(enabled).toBe(true);
    expect(ctx.storage.isEnabled()).toBe(true);
  });

  it('appendLogEntry writes only while enabled', async () => {
    ctx.storage.appendLogEntry({ ts: 1, level: 'info', message: 'before-enable' });
    expect(ctx.db.prepare('SELECT COUNT(*) AS c FROM debug_logs').get().c).toBe(0);

    await ctx.storage.enableDebugLogging();
    ctx.storage.appendLogEntry({ ts: 2, level: 'warn', message: 'after-enable' });
    expect(ctx.db.prepare('SELECT COUNT(*) AS c FROM debug_logs').get().c).toBe(1);

    const row = ctx.db.prepare('SELECT level, message, byte_size FROM debug_logs').get();
    expect(row.level).toBe('warn');
    expect(row.message).toBe('after-enable');
    expect(row.byte_size).toBe(Buffer.byteLength('after-enable', 'utf-8'));
  });

  it('disableDebugLogging stops writes but keeps existing rows', async () => {
    await ctx.storage.enableDebugLogging();
    ctx.storage.appendLogEntry({ ts: 1, level: 'info', message: 'keep-me' });
    await ctx.storage.disableDebugLogging();
    ctx.storage.appendLogEntry({ ts: 2, level: 'info', message: 'never-written' });

    const rows = ctx.db.prepare('SELECT message FROM debug_logs ORDER BY id').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toBe('keep-me');
  });

  it('enableDebugLogging clears previous logs only when asked', async () => {
    await ctx.storage.enableDebugLogging();
    ctx.storage.appendLogEntry({ ts: 1, level: 'info', message: 'pre-existing' });
    await ctx.storage.disableDebugLogging();

    await ctx.storage.enableDebugLogging({ clearPrevious: false });
    expect(ctx.db.prepare('SELECT COUNT(*) AS c FROM debug_logs').get().c).toBe(1);

    await ctx.storage.disableDebugLogging();
    await ctx.storage.enableDebugLogging({ clearPrevious: true });
    expect(ctx.db.prepare('SELECT COUNT(*) AS c FROM debug_logs').get().c).toBe(0);
  });

  it('hasAnyLogs / wasEverEnabled report correctly', async () => {
    expect(ctx.storage.hasAnyLogs()).toBe(false);
    expect(await ctx.storage.wasEverEnabled()).toBe(false);

    await ctx.storage.enableDebugLogging();
    ctx.storage.appendLogEntry({ ts: 1, level: 'info', message: 'hi' });
    expect(ctx.storage.hasAnyLogs()).toBe(true);
    expect(await ctx.storage.wasEverEnabled()).toBe(true);
  });

  it('getCurrentSize reflects the on-disk byte total', async () => {
    await ctx.storage.enableDebugLogging();
    ctx.storage.appendLogEntry({ ts: 1, level: 'info', message: 'hello' }); // 5 bytes
    ctx.storage.appendLogEntry({ ts: 2, level: 'info', message: 'world!' }); // 6 bytes
    expect(await ctx.storage.getCurrentSize()).toBe(11);
  });

  it('rolling buffer drops oldest rows once the cap is exceeded', async () => {
    await ctx.storage.enableDebugLogging();
    const cap = ctx.storage.getMaxSize();

    // Insert one row whose payload exceeds the entire cap. trimToFit must drop the
    // oldest row(s) until the live size falls back under the cap. With a single
    // oversized row, the only outcome is "table empty".
    const giantText = 'X'.repeat(cap + 1024);
    ctx.storage.appendLogEntry({ ts: 10, level: 'info', message: giantText });

    const remaining = await ctx.storage.getCurrentSize();
    expect(remaining).toBeLessThanOrEqual(cap);
    expect(remaining).toBe(0);
    expect(ctx.db.prepare('SELECT COUNT(*) AS c FROM debug_logs').get().c).toBe(0);
  });

  it('rolling buffer keeps newer rows when only the oldest need to go', async () => {
    await ctx.storage.enableDebugLogging();
    const cap = ctx.storage.getMaxSize();

    // Push the size just over the cap with one big row, then a smaller "newer" row
    // that should survive the trim because it is not at the head of the queue.
    const bigText = 'A'.repeat(cap - 10); // ~5 MiB - 10 bytes
    ctx.storage.appendLogEntry({ ts: 1, level: 'info', message: bigText });

    // At this point we are just under the cap. Pushing one more row will tip us over.
    ctx.storage.appendLogEntry({ ts: 2, level: 'warn', message: 'tip-over message which keeps us above cap' });

    const remainingRows = ctx.db.prepare('SELECT message FROM debug_logs ORDER BY id ASC').all();
    // The oldest (big) row must be gone; the newer one survives.
    expect(remainingRows).toHaveLength(1);
    expect(remainingRows[0].message).toContain('tip-over');

    const remainingSize = await ctx.storage.getCurrentSize();
    expect(remainingSize).toBeLessThanOrEqual(cap);
    // And the cache must match what SQLite reports, verifies no drift after trim.
    const dbSize = ctx.db.prepare('SELECT COALESCE(SUM(byte_size),0) AS s FROM debug_logs').get().s;
    expect(remainingSize).toBe(dbSize);
  });

  it('cachedSize stays consistent across enable → append → disable → re-enable(clear) cycles', async () => {
    await ctx.storage.enableDebugLogging();
    ctx.storage.appendLogEntry({ ts: 1, level: 'info', message: 'one' });
    ctx.storage.appendLogEntry({ ts: 2, level: 'info', message: 'two' });
    const sizeAfterFirst = await ctx.storage.getCurrentSize();

    await ctx.storage.disableDebugLogging();
    expect(await ctx.storage.getCurrentSize()).toBe(sizeAfterFirst);

    await ctx.storage.enableDebugLogging({ clearPrevious: true });
    expect(await ctx.storage.getCurrentSize()).toBe(0);

    ctx.storage.appendLogEntry({ ts: 3, level: 'info', message: 'fresh' });
    const dbSize = ctx.db.prepare('SELECT COALESCE(SUM(byte_size),0) AS s FROM debug_logs').get().s;
    expect(await ctx.storage.getCurrentSize()).toBe(dbSize);
  });

  it('clearAllDebugLogs empties the table and resets cached size', async () => {
    await ctx.storage.enableDebugLogging();
    ctx.storage.appendLogEntry({ ts: 1, level: 'info', message: 'foo' });
    ctx.storage.appendLogEntry({ ts: 2, level: 'info', message: 'bar' });
    expect(await ctx.storage.getCurrentSize()).toBeGreaterThan(0);

    ctx.storage.clearAllDebugLogs();

    expect(ctx.db.prepare('SELECT COUNT(*) AS c FROM debug_logs').get().c).toBe(0);
    expect(await ctx.storage.getCurrentSize()).toBe(0);
  });

  it('getAllDebugLogs returns rows ordered chronologically', async () => {
    await ctx.storage.enableDebugLogging();
    ctx.storage.appendLogEntry({ ts: 1, level: 'info', message: 'first' });
    ctx.storage.appendLogEntry({ ts: 2, level: 'warn', message: 'second' });
    ctx.storage.appendLogEntry({ ts: 3, level: 'error', message: 'third' });

    const rows = ctx.storage.getAllDebugLogs();
    expect(rows.map((r) => r.message)).toEqual(['first', 'second', 'third']);
    expect(rows.map((r) => r.level)).toEqual(['info', 'warn', 'error']);
  });

  describe('logger sink wiring', () => {
    let logger;
    let consoleSpies;

    beforeEach(async () => {
      // Storage imports the same logger module; vi.resetModules() ensured both share
      // the same fresh instance for this test. Spies silence console output so the
      // vitest report stays clean while we exercise real logger.info() calls.
      logger = (await import(path.resolve('lib/services/logger.js'))).default;
      consoleSpies = {
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      };
    });

    afterEach(() => {
      // Detach sink between tests to prevent cross-test pollution from the shared
      // logger module instance.
      logger.setDebugLogSink(null);
      for (const spy of Object.values(consoleSpies)) spy.mockRestore();
    });

    it('routes logger calls into debug_logs once enabled', async () => {
      await ctx.storage.enableDebugLogging();
      logger.info('captured-via-logger');
      const rows = ctx.db.prepare('SELECT level, message FROM debug_logs').all();
      expect(rows).toHaveLength(1);
      expect(rows[0].level).toBe('info');
      expect(rows[0].message).toContain('captured-via-logger');
    });

    it('detaches the sink on disable so logger calls no longer hit the DB', async () => {
      await ctx.storage.enableDebugLogging();
      await ctx.storage.disableDebugLogging();
      logger.info('not-captured');
      expect(ctx.db.prepare('SELECT COUNT(*) AS c FROM debug_logs').get().c).toBe(0);
    });

    it('restores the sink on reloadEnabledFromSettings when persisted state is on', async () => {
      ctx.settings.debug_logging_enabled = true;
      await ctx.storage.reloadEnabledFromSettings();
      logger.warn('captured-after-restart');
      const rows = ctx.db.prepare('SELECT level, message FROM debug_logs').all();
      expect(rows).toHaveLength(1);
      expect(rows[0].level).toBe('warn');
      expect(rows[0].message).toContain('captured-after-restart');
    });
  });
});
