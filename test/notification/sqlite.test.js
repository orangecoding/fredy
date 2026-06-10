/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { vi, beforeEach, afterEach } from 'vitest';

// Mock markdown dependency
vi.mock('../../../lib/services/markdown.js', () => ({
  markdown2Html: () => '',
}));

import { safeDatabasePath, send } from '../../../lib/notification/adapter/sqlite.js';

describe('sqlite notification adapter – path traversal protection', () => {
  describe('safeDatabasePath', () => {
    it('allows a simple relative path within cwd', () => {
      const result = safeDatabasePath('db/listings.db');
      const expected = path.resolve(process.cwd(), 'db/listings.db');
      expect(result).toBe(expected);
    });

    it('allows a nested relative path within cwd', () => {
      const result = safeDatabasePath('data/sqlite/output.db');
      const expected = path.resolve(process.cwd(), 'data/sqlite/output.db');
      expect(result).toBe(expected);
    });

    it('rejects absolute paths', () => {
      expect(() => safeDatabasePath('/etc/passwd')).toThrow('Absolute database paths are not allowed');
      expect(() => safeDatabasePath('/tmp/evil.db')).toThrow('Absolute database paths are not allowed');
    });

    it('rejects traversal sequences that escape cwd', () => {
      expect(() => safeDatabasePath('../../etc/cron.d/evil.db')).toThrow(
        'Database path must be within the application directory',
      );
      expect(() => safeDatabasePath('../../../tmp/evil.db')).toThrow(
        'Database path must be within the application directory',
      );
    });

    it('rejects traversal hidden in nested components', () => {
      expect(() => safeDatabasePath('db/../../../../../../etc/cron.d/evil.db')).toThrow(
        'Database path must be within the application directory',
      );
    });

    it('rejects paths without .db extension', () => {
      expect(() => safeDatabasePath('db/listings.txt')).toThrow('Database path must end with .db');
      expect(() => safeDatabasePath('db/listings')).toThrow('Database path must end with .db');
    });

    it('allows the default path', () => {
      const result = safeDatabasePath('db/listings.db');
      expect(result).toBe(path.resolve(process.cwd(), 'db/listings.db'));
    });
  });

  describe('send – integration', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('rejects a malicious dbPath at send time', () => {
      const notificationConfig = [
        {
          id: 'sqlite',
          fields: {
            dbPath: '../../../../tmp/evil.db',
          },
        },
      ];

      expect(() =>
        send({
          serviceName: 'test',
          newListings: [{ id: '1', title: 'Test', link: 'http://example.com' }],
          jobKey: 'job1',
          notificationConfig,
        }),
      ).toThrow('Database path must be within the application directory');
    });

    it('rejects an absolute dbPath at send time', () => {
      const notificationConfig = [
        {
          id: 'sqlite',
          fields: {
            dbPath: '/tmp/evil.db',
          },
        },
      ];

      expect(() =>
        send({
          serviceName: 'test',
          newListings: [{ id: '1', title: 'Test', link: 'http://example.com' }],
          jobKey: 'job1',
          notificationConfig,
        }),
      ).toThrow('Absolute database paths are not allowed');
    });
  });
});
