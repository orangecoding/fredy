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

    it('redacts proxy URL credentials and the proxy host', async () => {
      const sys = await svc.buildSystemInfo({
        settings: { proxyUrl: 'http://someone:hunter2@proxy.internal.example:8080', port: 9998 },
      });
      expect(sys).not.toContain('hunter2');
      expect(sys).not.toContain('someone');
      expect(sys).not.toContain('proxy.internal.example');
      // Scheme and port survive: both are things a maintainer triages against.
      expect(sys).toContain('proxyUrl: http://<redacted>:8080/');
      expect(sys).toContain('port: 9998');
    });

    it('redacts the host of baseUrl, which used to expose the deployment', async () => {
      const sys = await svc.buildSystemInfo({
        settings: { baseUrl: 'https://fredy.intranet.acme.corp/immo' },
      });
      expect(sys).not.toContain('fredy.intranet.acme.corp');
      expect(sys).toContain('baseUrl: https://<redacted>/immo');
    });

    it('redacts the host of any other URL-valued setting', async () => {
      const sys = await svc.buildSystemInfo({
        settings: { motisBaseUrl: 'https://motis.internal.lan:8080/api' },
      });
      expect(sys).not.toContain('motis.internal.lan');
      expect(sys).toContain('motisBaseUrl: https://<redacted>:8080/api');
    });

    it('redacts query parameter values but keeps their names', async () => {
      const sys = await svc.buildSystemInfo({
        settings: { motisBaseUrl: 'https://routing.example/api?apiKey=abcd1234&mode=fast' },
      });
      expect(sys).not.toContain('abcd1234');
      expect(sys).not.toContain('mode=fast');
      expect(sys).toContain('apiKey=%3Credacted%3E');
      expect(sys).toContain('mode=%3Credacted%3E');
    });

    it('leaves non-URL settings untouched', async () => {
      const sys = await svc.buildSystemInfo({
        settings: { sqlitepath: '/db', interval: 60, workingHours: { from: '', to: '', timeZone: null } },
      });
      expect(sys).toContain('sqlitepath: /db');
      expect(sys).toContain('interval: 60');
      expect(sys).toContain('workingHours: {"from":"","to":"","timeZone":null}');
    });

    it('strips session secrets from sanitized settings output', async () => {
      const sys = await svc.buildSystemInfo({
        settings: { session_secret: 'top-secret', sessionSecret: 'other-secret', port: 9998 },
      });
      expect(sys).not.toContain('top-secret');
      expect(sys).not.toContain('other-secret');
    });

    it('redacts credential-shaped settings by key name, whatever they are called', async () => {
      const sys = await svc.buildSystemInfo({
        settings: {
          mcp_token: 'mcp-abc',
          smtpPassword: 'hunter2',
          someApiKey: 'ak-live-1',
          nothingSensitive: 'plain',
        },
      });
      expect(sys).not.toContain('mcp-abc');
      expect(sys).not.toContain('hunter2');
      expect(sys).not.toContain('ak-live-1');
      expect(sys).toContain('mcp_token: <redacted>');
      expect(sys).toContain('smtpPassword: <redacted>');
      expect(sys).toContain('someApiKey: <redacted>');
      expect(sys).toContain('nothingSensitive: plain');
    });

    it('never prints the real hostname, but keeps a stable digest of it', async () => {
      const os = await import('node:os');
      const sys = await svc.buildSystemInfo({ settings: null });

      expect(sys).not.toContain(os.hostname());
      expect(sys).toMatch(/Hostname:\s+<redacted>:[0-9a-f]{8}/);

      // Stable, so two bundles from the same host can be recognised as such.
      const again = await svc.buildSystemInfo({ settings: null });
      const digest = (out) => out.match(/Hostname:\s+(\S+)/)[1];
      expect(digest(sys)).toBe(digest(again));
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
