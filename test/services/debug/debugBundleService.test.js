/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';

describe('services/debug/debugBundleService.js', () => {
  let svc;
  let storedLogs;
  let addedZipEntries;

  beforeEach(async () => {
    storedLogs = [];
    addedZipEntries = [];

    /**
     * Minimal AdmZip stand-in that records the in-memory entry names + payloads so we
     * can assert what made it into the bundle without spinning up real zip parsing.
     */
    class MockAdmZip {
      constructor() {
        this.entries = [];
      }
      addFile(name, buf) {
        this.entries.push({ entryName: name, data: buf });
        addedZipEntries.push({ entryName: name, content: buf.toString('utf-8') });
      }
      toBuffer() {
        return Buffer.from(JSON.stringify(this.entries.map((e) => e.entryName)));
      }
    }
    globalThis.__TEST_ADM_ZIP__ = MockAdmZip;

    const ROOT = path.resolve('.');
    const storagePath = path.join(ROOT, 'lib', 'services', 'debug', 'debugLogStorage.js');
    const utilsPath = path.join(ROOT, 'lib', 'utils.js');

    const storageMock = {
      getAllDebugLogs: () => storedLogs,
    };
    const utilsMock = { getPackageVersion: async () => '22.5.0' };

    vi.resetModules();
    vi.doMock(storagePath, () => storageMock);
    vi.doMock(utilsPath, () => utilsMock);

    svc = await import(path.join(ROOT, 'lib', 'services', 'debug', 'debugBundleService.js'));
  });

  afterEach(() => {
    delete globalThis.__TEST_ADM_ZIP__;
  });

  describe('renderLogsTxt', () => {
    it('returns an empty string when there are no rows', () => {
      expect(svc.renderLogsTxt()).toBe('');
    });

    it('formats each row as [date] LEVEL: message and keeps order', () => {
      storedLogs.push({ id: 1, ts: 1717855200000, level: 'info', message: 'first line' });
      storedLogs.push({ id: 2, ts: 1717855201000, level: 'warn', message: 'second line' });

      const out = svc.renderLogsTxt();

      expect(out).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] INFO: first line/);
      expect(out).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] WARN: second line/);
      expect(out.indexOf('first line')).toBeLessThan(out.indexOf('second line'));
      expect(out.endsWith('\n')).toBe(true);
    });
  });

  describe('buildSystemInfo', () => {
    it('contains Fredy version, Node version and OS platform', async () => {
      const sys = await svc.buildSystemInfo({ settings: null });
      expect(sys).toMatch(/Fredy version:\s+22\.5\.0/);
      expect(sys).toContain(`Node.js version:   ${process.version}`);
      expect(sys).toContain(`Platform:          ${process.platform}`);
    });

    it('redacts proxy URL credentials', async () => {
      const sys = await svc.buildSystemInfo({
        settings: { proxyUrl: 'http://secret:hunter2@proxy.example:8080', port: 9998 },
      });
      expect(sys).not.toContain('hunter2');
      expect(sys).not.toContain('secret');
      expect(sys).toContain('proxy.example');
      expect(sys).toContain('port: 9998');
    });

    it('strips session secrets from sanitized settings output', async () => {
      const sys = await svc.buildSystemInfo({
        settings: { session_secret: 'top-secret', sessionSecret: 'other-secret', port: 9998 },
      });
      expect(sys).not.toContain('top-secret');
      expect(sys).not.toContain('other-secret');
    });
  });

  describe('buildDebugBundleFileName', () => {
    it('matches YYYY-MM-DD-FredyDebug-<version>.zip', async () => {
      const name = await svc.buildDebugBundleFileName();
      expect(name).toMatch(/^\d{4}-\d{2}-\d{2}-FredyDebug-22\.5\.0\.zip$/);
    });
  });

  describe('buildDebugBundleZip', () => {
    it('always emits both logs.txt and sys.txt entries', async () => {
      storedLogs.push({ id: 1, ts: 1717855200000, level: 'info', message: 'recorded line' });
      await svc.buildDebugBundleZip({ settings: { port: 9998 } });

      const names = addedZipEntries.map((e) => e.entryName).sort();
      expect(names).toEqual(['logs.txt', 'sys.txt']);

      const logs = addedZipEntries.find((e) => e.entryName === 'logs.txt');
      const sys = addedZipEntries.find((e) => e.entryName === 'sys.txt');
      expect(logs.content).toContain('recorded line');
      expect(sys.content).toMatch(/Fredy version:\s+22\.5\.0/);
      expect(sys.content).toContain('port: 9998');
    });

    it('includes a placeholder message when no logs are stored', async () => {
      await svc.buildDebugBundleZip({ settings: null });
      const logs = addedZipEntries.find((e) => e.entryName === 'logs.txt');
      expect(logs.content).toMatch(/no debug log entries/i);
    });
  });
});
