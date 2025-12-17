/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'chai';
import esmock from 'esmock';

describe('services/storage/backupRestoreService.js - precheck & filename', () => {
  let svc;
  let admZipMock;
  let calls;

  beforeEach(async () => {
    calls = { logger: { info: [], warn: [], error: [] } };

    // Mock AdmZip with configurable state
    let state = { hasDb: false, meta: null };
    class MockAdmZip {
      constructor() {}
      getEntry(name) {
        if (name === 'listings.db') {
          if (state.hasDb) return { getData: () => Buffer.from('db') };
          return null;
        }
        if (name === 'fredy-backup.json') {
          if (state.meta) return { getData: () => Buffer.from(JSON.stringify(state.meta)) };
          return null;
        }
        return null;
      }
      getEntries() {
        const arr = [];
        if (state.hasDb) arr.push({ entryName: 'listings.db', getData: () => Buffer.from('db') });
        return arr;
      }
    }
    admZipMock = { default: MockAdmZip, __set: (s) => (state = { ...state, ...s }) };

    const path = await import('node:path');
    const ROOT = path.resolve('.');

    // Mocks for dependencies
    const migratePath = path.join(ROOT, 'lib', 'services', 'storage', 'migrations', 'migrate.js');
    const sqlitePath = path.join(ROOT, 'lib', 'services', 'storage', 'SqliteConnection.js');
    const loggerPath = path.join(ROOT, 'lib', 'services', 'logger.js');
    const utilsPath = path.join(ROOT, 'lib', 'utils.js');

    const migrateMock = {
      listMigrationFiles: () => [{ id: 10 }],
      runMigrations: async () => {},
    };

    const sqliteMock = {
      default: {
        getConnection: () => ({ backup: async () => {} }),
        close: () => {},
        tableExists: () => false,
        query: () => [],
        withTransaction: (cb) => cb({ prepare: () => ({ run: () => {} }) }),
      },
      computeDbPath: async () => ({ dir: '/tmp', dbPath: '/tmp/listings.db' }),
    };

    const loggerMock = {
      info: (...a) => calls.logger.info.push(a),
      warn: (...a) => calls.logger.warn.push(a),
      error: (...a) => calls.logger.error.push(a),
    };

    const utilsMock = { getPackageVersion: async () => '16.2.0' };

    const mod = await esmock(
      path.join(ROOT, 'lib', 'services', 'storage', 'backupRestoreService.js'),
      {},
      {
        'adm-zip': admZipMock,
        [migratePath]: migrateMock,
        [sqlitePath]: sqliteMock,
        [loggerPath]: loggerMock,
        [utilsPath]: utilsMock,
      },
    );

    svc = mod;
  });

  it('precheck: empty upload yields danger', async () => {
    const res = await svc.precheckRestore(Buffer.alloc(0));
    expect(res.compatible).to.equal(false);
    expect(res.severity).to.equal('danger');
    expect(res.message).to.contain('Empty upload');
    expect(res.requiredMigration).to.equal(10);
  });

  it('precheck: missing listings.db yields danger', async () => {
    admZipMock.__set({ hasDb: false, meta: { dbMigration: 9 } });
    const res = await svc.precheckRestore(Buffer.from('dummy'));
    expect(res.compatible).to.equal(false);
    expect(res.severity).to.equal('danger');
    expect(res.message).to.match(/missing the database file/i);
  });

  it('precheck: older backup is compatible with warning', async () => {
    admZipMock.__set({ hasDb: true, meta: { dbMigration: 5, fredyVersion: '16.0.0' } });
    const res = await svc.precheckRestore(Buffer.from('zip'));
    expect(res.compatible).to.equal(true);
    expect(res.severity).to.equal('warning');
    expect(res.message).to.match(/automatic migrations/i);
    expect(res.backupMigration).to.equal(5);
    expect(res.requiredMigration).to.equal(10);
  });

  it('precheck: equal backup is compatible with info', async () => {
    admZipMock.__set({ hasDb: true, meta: { dbMigration: 10 } });
    const res = await svc.precheckRestore(Buffer.from('zip'));
    expect(res.compatible).to.equal(true);
    expect(res.severity).to.equal('info');
  });

  it('precheck: newer backup yields danger', async () => {
    admZipMock.__set({ hasDb: true, meta: { dbMigration: 11 } });
    const res = await svc.precheckRestore(Buffer.from('zip'));
    expect(res.compatible).to.equal(false);
    expect(res.severity).to.equal('danger');
  });

  it('buildBackupFileName: matches pattern and includes version', async () => {
    const name = await svc.buildBackupFileName();
    expect(name).to.match(/^\d{4}-\d{2}-\d{2}-FredyBackup-/);
    expect(name).to.include('16.2.0');
    expect(name).to.match(/\.zip$/);
  });
});
