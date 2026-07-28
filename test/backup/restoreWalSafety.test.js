/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';

const ROOT = path.resolve('.');
const DB_PATH = '/tmp/fredy-restore-test/listings.db';

/**
 * Restoring a backup swaps the database file underneath a running process. Two things have to
 * happen around that swap or the restored instance is quietly wrong: the WAL sidecars of the old
 * database must not survive next to the new file, and the caches that were built from the old
 * database have to be rebuilt.
 */
describe('restoreFromZip - WAL safety and cache invalidation', () => {
  let svc;
  let recorded;

  beforeEach(async () => {
    recorded = {
      pragmas: [],
      closed: 0,
      reopened: 0,
      copied: [],
      removed: [],
      settingsRefreshed: 0,
      similarityRebuilt: 0,
      order: [],
    };

    globalThis.__TEST_ADM_ZIP__ = class {
      getEntry(name) {
        if (name === 'listings.db') return { getData: () => Buffer.from('restored-db') };
        if (name === 'fredy-backup.json') return { getData: () => Buffer.from(JSON.stringify({ dbMigration: 10 })) };
        return null;
      }
      getEntries() {
        return [{ entryName: 'listings.db', getData: () => Buffer.from('restored-db') }];
      }
    };

    const fsMock = {
      existsSync: () => true,
      mkdirSync: () => {},
      mkdtempSync: () => '/tmp/fredy-restore-tmp',
      writeFileSync: () => {},
      copyFileSync: (from, to) => {
        recorded.copied.push({ from, to });
        recorded.order.push(`copy:${to}`);
      },
      rmSync: (target) => {
        if (String(target).endsWith('-wal') || String(target).endsWith('-shm')) {
          recorded.removed.push(target);
          recorded.order.push(`rm:${target}`);
        }
      },
      readFileSync: () => Buffer.from('{}'),
    };

    vi.resetModules();
    vi.doMock('fs', () => ({ default: fsMock, ...fsMock }));
    vi.doMock(path.join(ROOT, 'lib', 'services', 'storage', 'migrations', 'migrate.js'), () => ({
      listMigrationFiles: () => [{ id: 10 }],
      runMigrations: async () => {},
    }));
    vi.doMock(path.join(ROOT, 'lib', 'services', 'storage', 'SqliteConnection.js'), () => ({
      default: {
        getConnection: () => {
          recorded.reopened += 1;
          return {
            backup: async () => {},
            pragma: (p) => {
              recorded.pragmas.push(p);
              recorded.order.push(`pragma:${p}`);
            },
          };
        },
        close: () => {
          recorded.closed += 1;
          recorded.order.push('close');
        },
        tableExists: () => false,
        query: () => [],
      },
      computeDbPath: async () => ({ dir: path.dirname(DB_PATH), dbPath: DB_PATH }),
    }));
    vi.doMock(path.join(ROOT, 'lib', 'services', 'logger.js'), () => ({
      default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    }));
    vi.doMock(path.join(ROOT, 'lib', 'utils.js'), () => ({ getPackageVersion: async () => '23.2.3' }));
    vi.doMock(path.join(ROOT, 'lib', 'services', 'storage', 'settingsStorage.js'), () => ({
      refreshSettingsCache: async () => {
        recorded.settingsRefreshed += 1;
        recorded.order.push('settings');
      },
    }));
    vi.doMock(path.join(ROOT, 'lib', 'services', 'similarity-check', 'similarityCache.js'), () => ({
      initSimilarityCache: () => {
        recorded.similarityRebuilt += 1;
        recorded.order.push('similarity');
      },
    }));

    svc = await import(path.join(ROOT, 'lib', 'services', 'storage', 'backupRestoreService.js'));
  });

  it('checkpoints the WAL before touching the database file', async () => {
    await svc.restoreFromZip(Buffer.from('zip'));
    expect(recorded.pragmas).toContain('wal_checkpoint(TRUNCATE)');
    // The safety copy is only complete if the WAL was folded in first.
    const checkpointAt = recorded.order.indexOf('pragma:wal_checkpoint(TRUNCATE)');
    const firstCopyAt = recorded.order.findIndex((step) => step.startsWith('copy:'));
    expect(checkpointAt).toBeGreaterThanOrEqual(0);
    expect(checkpointAt).toBeLessThan(firstCopyAt);
  });

  it('removes the -wal and -shm sidecars of the replaced database', async () => {
    await svc.restoreFromZip(Buffer.from('zip'));
    expect(recorded.removed).toContain(`${DB_PATH}-wal`);
    expect(recorded.removed).toContain(`${DB_PATH}-shm`);
  });

  it('removes the sidecars before copying the new database into place', async () => {
    await svc.restoreFromZip(Buffer.from('zip'));
    // The other order lets SQLite replay the old WAL into the new file, or refuse to open it.
    const lastRemoveAt = recorded.order.findLastIndex((step) => step.startsWith('rm:'));
    const restoreCopyAt = recorded.order.findLastIndex((step) => step === `copy:${DB_PATH}`);
    expect(lastRemoveAt).toBeLessThan(restoreCopyAt);
  });

  it('still takes the .bak safety copy of the old database', async () => {
    await svc.restoreFromZip(Buffer.from('zip'));
    expect(recorded.copied.some(({ from, to }) => from === DB_PATH && to.includes('.bak-'))).toBe(true);
  });

  it('rebuilds the settings and similarity caches, which the file swap bypasses', async () => {
    await svc.restoreFromZip(Buffer.from('zip'));
    expect(recorded.settingsRefreshed).toBe(1);
    expect(recorded.similarityRebuilt).toBe(1);
  });

  it('rebuilds the caches only after the new database is readable', async () => {
    await svc.restoreFromZip(Buffer.from('zip'));
    const restoreCopyAt = recorded.order.findLastIndex((step) => step === `copy:${DB_PATH}`);
    expect(recorded.order.indexOf('settings')).toBeGreaterThan(restoreCopyAt);
    expect(recorded.order.indexOf('similarity')).toBeGreaterThan(restoreCopyAt);
  });

  it('reports the restore as done', async () => {
    const result = await svc.restoreFromZip(Buffer.from('zip'));
    expect(result.restored).toBe(true);
  });
});
