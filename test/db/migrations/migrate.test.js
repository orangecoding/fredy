/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'chai';
import esmock from 'esmock';

// We will fully mock fs, crypto, SqliteConnection, and dynamic import of migration modules

describe('db/migrations/migrate.js - runMigrations', () => {
  let calls;
  let runMigrations;
  let prevExitCode;

  beforeEach(async () => {
    calls = {
      fs: { existsSync: [], mkdirSync: [], readdirSync: [], readFileSync: [] },
      sql: {
        getConnection: 0,
        tableExists: false,
        query: [],
        execute: [],
        withTransaction: [],
        optimize: 0,
      },
      logs: { info: [], warn: [], error: [] },
    };

    // Mock fs to avoid touching disk
    const fsMock = {
      existsSync: (p) => {
        calls.fs.existsSync.push(p);
        return true;
      },
      mkdirSync: (p, opts) => {
        calls.fs.mkdirSync.push({ p, opts });
      },
      readdirSync: (p) => {
        calls.fs.readdirSync.push(p);
        return [];
      },
      readFileSync: (p) => {
        calls.fs.readFileSync.push(p);
        return Buffer.from('dummy');
      },
    };

    // Mock crypto sha256
    const cryptoMock = {
      createHash: () => ({ update: () => ({ digest: () => 'sha256sum' }) }),
    };

    // Mock logger
    const loggerMock = {
      info: (...a) => calls.logs.info.push(a),
      warn: (...a) => calls.logs.warn.push(a),
      error: (...a) => calls.logs.error.push(a),
    };

    // Mock SqliteConnection
    const sqlMock = {
      getConnection: () => {
        calls.sql.getConnection += 1;
        return {};
      },
      tableExists: () => calls.sql.tableExists,
      query: (sql) => {
        calls.sql.query.push(sql);
        return [];
      },
      execute: (sql, params) => {
        calls.sql.execute.push({ sql, params });
        return { changes: 1 };
      },
      withTransaction: (cb) => {
        calls.sql.withTransaction.push(true);
        const db = {
          prepare: (s) => ({ run: (...args) => calls.sql.execute.push({ sql: s, params: args }) }),
        };
        return cb(db);
      },
      optimize: () => {
        calls.sql.optimize += 1;
      },
    };

    // esmock with dependency replacements
    const path = await import('node:path');
    const ROOT = path.resolve('.');
    const sqlPath = path.join(ROOT, 'lib', 'services', 'storage', 'SqliteConnection.js');
    const loggerPath = path.join(ROOT, 'lib', 'services', 'logger.js');
    const mod = await esmock(
      '../../../db/migrations/migrate.js',
      {},
      {
        fs: fsMock,
        crypto: cryptoMock,
        [sqlPath]: sqlMock,
        [loggerPath]: loggerMock,
      },
    );

    runMigrations = mod.runMigrations;

    // remember original exitCode to restore later
    prevExitCode = process.exitCode;
  });

  afterEach(() => {
    // restore original process.exitCode
    process.exitCode = prevExitCode;
  });

  it('logs and returns when no migration files are found', async () => {
    await runMigrations();
    expect(calls.logs.info.some((a) => String(a[0]).includes('No migration files'))).to.equal(true);
    expect(calls.sql.getConnection).to.equal(0);
    expect(calls.sql.optimize).to.equal(0);
  });

  it('applies a single new migration inside a transaction and records it', async () => {
    // Re-mock with one file and module loader
    const fsMock = {
      existsSync: () => true,
      mkdirSync: () => {},
      readdirSync: () => ['1.init.js'],
      readFileSync: () => Buffer.from('dummy'),
    };
    const cryptoMock = { createHash: () => ({ update: () => ({ digest: () => 'abc' }) }) };
    const loggerMock = {
      info: (...a) => calls.logs.info.push(a),
      warn: (...a) => calls.logs.warn.push(a),
      error: (...a) => calls.logs.error.push(a),
    };

    const sqlMock = {
      getConnection: () => {
        calls.sql.getConnection += 1;
        return {};
      },
      tableExists: () => false, // schema_migrations not present yet
      query: () => [],
      execute: (sql, params) => {
        calls.sql.execute.push({ sql, params });
        return { changes: 1 };
      },
      withTransaction: (cb) => {
        calls.sql.withTransaction.push(true);
        const db = {
          exec: () => {},
          prepare: (s) => ({ run: (...args) => calls.sql.execute.push({ sql: s, params: args }) }),
        };
        return cb(db);
      },
      optimize: () => {
        calls.sql.optimize += 1;
      },
    };

    // The migration module: exports up(db)
    const migrationModule = {
      up: (db) => {
        db.exec && db.exec('CREATE TABLE schema_migrations(name TEXT)');
      },
    };

    // We need to intercept dynamic import by esmock: provide a stub for import(url)
    // esmock supports mocking via a virtual module using URL matching, but simpler approach:
    // place the file path that migrate.js will compute and make Node import resolve to our stub
    // We simulate by mocking url.pathToFileURL is still used, but dynamic import will be handled by esmock when we map the computed path.

    const path = await import('node:path');
    const ROOT = path.resolve('.');

    const sqlPath = path.join(ROOT, 'lib', 'services', 'storage', 'SqliteConnection.js');
    const loggerPath = path.join(ROOT, 'lib', 'services', 'logger.js');
    // Use global importer hook to bypass dynamic import
    globalThis.__TEST_MIGRATE_IMPORT__ = async () => migrationModule;

    const mod = await esmock(
      '../../../db/migrations/migrate.js',
      {},
      {
        fs: fsMock,
        crypto: cryptoMock,
        [sqlPath]: sqlMock,
        [loggerPath]: loggerMock,
      },
    );

    runMigrations = mod.runMigrations;

    await runMigrations();

    // Should have started a transaction and inserted into schema_migrations
    expect(calls.sql.withTransaction.length).to.equal(1);
    const inserted = calls.sql.execute.find((e) => String(e.sql).includes('INSERT INTO schema_migrations'));
    expect(!!inserted).to.equal(true);
    expect(calls.sql.optimize).to.equal(1);
  });

  it('skips already executed migration with same checksum', async () => {
    const fsMock = {
      existsSync: () => true,
      mkdirSync: () => {},
      readdirSync: () => ['1.init.js'],
      readFileSync: () => Buffer.from('dummy'),
    };
    const cryptoMock = { createHash: () => ({ update: () => ({ digest: () => 'same' }) }) };
    const loggerMock = {
      info: (...a) => calls.logs.info.push(a),
      warn: (...a) => calls.logs.warn.push(a),
      error: (...a) => calls.logs.error.push(a),
    };

    const sqlMock = {
      getConnection: () => {
        calls.sql.getConnection += 1;
        return {};
      },
      tableExists: () => true,
      query: () => [{ name: '1.init.js', checksum: 'same' }],
      execute: (sql, params) => {
        calls.sql.execute.push({ sql, params });
        return { changes: 1 };
      },
      withTransaction: (cb) => {
        calls.sql.withTransaction.push(true);
        const db = { prepare: (s) => ({ run: (...args) => calls.sql.execute.push({ sql: s, params: args }) }) };
        return cb(db);
      },
      optimize: () => {
        calls.sql.optimize += 1;
      },
    };

    const path = await import('node:path');
    const ROOT = path.resolve('.');
    const sqlPath = path.join(ROOT, 'lib', 'services', 'storage', 'SqliteConnection.js');
    const loggerPath = path.join(ROOT, 'lib', 'services', 'logger.js');

    globalThis.__TEST_MIGRATE_IMPORT__ = async () => ({ up: () => {} });

    const mod = await esmock(
      '../../../db/migrations/migrate.js',
      {},
      {
        fs: fsMock,
        crypto: cryptoMock,
        [sqlPath]: sqlMock,
        [loggerPath]: loggerMock,
      },
    );

    runMigrations = mod.runMigrations;

    await runMigrations();

    // Should not run transaction because it's skipped
    expect(calls.sql.withTransaction.length).to.equal(0);
    expect(calls.sql.optimize).to.equal(1);
  });

  it('aborts with exitCode=1 when a migration throws, without applying insert', async () => {
    const fsMock = {
      existsSync: () => true,
      mkdirSync: () => {},
      readdirSync: () => ['1.bad.js'],
      readFileSync: () => Buffer.from('dummy'),
    };
    const cryptoMock = { createHash: () => ({ update: () => ({ digest: () => 'bad' }) }) };
    const loggerMock = {
      info: (...a) => calls.logs.info.push(a),
      warn: (...a) => calls.logs.warn.push(a),
      error: (...a) => calls.logs.error.push(a),
    };

    const sqlMock = {
      getConnection: () => {
        calls.sql.getConnection += 1;
        return {};
      },
      tableExists: () => false,
      query: () => [],
      execute: (sql, params) => {
        calls.sql.execute.push({ sql, params });
        return { changes: 1 };
      },
      withTransaction: (cb) => {
        calls.sql.withTransaction.push(true);
        const db = {
          exec: () => {},
          prepare: (s) => ({ run: (...args) => calls.sql.execute.push({ sql: s, params: args }) }),
        };
        return cb(db);
      },
      optimize: () => {
        calls.sql.optimize += 1;
      },
    };

    const path = await import('node:path');
    const ROOT = path.resolve('.');

    globalThis.__TEST_MIGRATE_IMPORT__ = async () => ({
      up: () => {
        throw new Error('boom');
      },
    });
    const sqlPath = path.join(ROOT, 'lib', 'services', 'storage', 'SqliteConnection.js');
    const loggerPath = path.join(ROOT, 'lib', 'services', 'logger.js');

    const mod = await esmock(
      '../../../lib/services/storage/migrations/migrate.js',
      {},
      {
        fs: fsMock,
        crypto: cryptoMock,
        [sqlPath]: sqlMock,
        [loggerPath]: loggerMock,
      },
    );

    runMigrations = mod.runMigrations;

    await runMigrations();

    expect(process.exitCode).to.equal(1);
    // No insert into schema_migrations should be recorded since transaction failed
    const inserted = calls.sql.execute.find((e) => String(e.sql).includes('INSERT INTO schema_migrations'));
    expect(inserted).to.equal(undefined);
  });
});
