/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'chai';
import esmock from 'esmock';

// We explicitly avoid touching the real filesystem or creating a real DB file.
// better-sqlite3 is fully mocked and operates in-memory via our stubs.

describe('SqliteConnection', () => {
  let SqliteConnection;
  let calls;

  beforeEach(async () => {
    calls = {
      fs: { existsSync: [], mkdirSync: [] },
      db: { pragma: [], prepare: [], transactionWraps: 0, close: 0 },
      prepareAll: [],
      prepareRun: [],
      prepareGet: [],
      processOnce: [],
      logs: { warn: [], debug: [] },
    };

    // stub for fs
    const fsMock = {
      existsSync: (dir) => {
        calls.fs.existsSync.push(dir);
        // Pretend directory always exists to avoid mkdir
        return true;
      },
      mkdirSync: (dir, opts) => {
        calls.fs.mkdirSync.push({ dir, opts });
      },
    };

    // Prepare object returned from db.prepare()
    const prepareObj = {
      all: (params) => {
        calls.prepareAll.push(params);
        return [{ x: 1 }];
      },
      run: (params) => {
        calls.prepareRun.push(params);
        return { changes: 1 };
      },
      get: (param) => {
        calls.prepareGet.push(param);
        // return truthy by default
        return { one: 1 };
      },
    };

    // Database mock constructor
    const BetterSqlite3Mock = function (filepath, options) {
      // expose on instance
      this.filepath = filepath;
      this.options = options;
      this.pragma = (p) => {
        calls.db.pragma.push(p);
        return undefined;
      };
      this.prepare = (sql) => {
        calls.db.prepare.push(sql);
        return prepareObj;
      };
      this.transaction = (fn) => {
        // better-sqlite3 returns a function that executes inside a transaction
        return (cb) => {
          calls.db.transactionWraps += 1;
          return fn(cb);
        };
      };
      this.close = () => {
        calls.db.close += 1;
      };
    };

    // esmock the module with our stubs
    SqliteConnection = await esmock(
      '../../lib/services/storage/SqliteConnection.js',
      {},
      {
        fs: fsMock,
        'better-sqlite3': { default: BetterSqlite3Mock },
      },
    );
  });

  afterEach(() => {
    // ensure we can close between tests
    SqliteConnection.close();
  });

  it('creates singleton connection and applies PRAGMAs without touching disk', () => {
    const db1 = SqliteConnection.getConnection();
    const db2 = SqliteConnection.getConnection();

    expect(db1).to.equal(db2);
    // journal_mode, synchronous, cache_size, foreign_keys, optimize
    expect(calls.db.pragma).to.deep.equal([
      'journal_mode = WAL',
      'synchronous = NORMAL',
      'cache_size = -64000',
      'foreign_keys = ON',
      'optimize',
    ]);
    // mkdirSync should not be called because existsSync returned true
    expect(calls.fs.mkdirSync).to.have.length(0);
  });

  it('executes query and execute helpers', () => {
    const rows = SqliteConnection.query('SELECT 1', {});
    expect(rows).to.be.an('array');
    expect(rows[0]).to.deep.equal({ x: 1 });

    const info = SqliteConnection.execute('UPDATE x SET y=1 WHERE id=@id', { id: 5 });
    expect(info).to.have.property('changes', 1);
  });

  it('tableExists uses sqlite_master get()', () => {
    const exists = SqliteConnection.tableExists('users');
    expect(exists).to.equal(true);
  });

  it('withTransaction wraps callback', () => {
    const result = SqliteConnection.withTransaction((db) => {
      // ensure we can use the db to prepare
      db.prepare('SELECT inside').all({});
      return 42;
    });
    expect(result).to.equal(42);
    expect(calls.db.prepare).to.include('SELECT inside');
  });

  it('optimize() delegates to PRAGMA optimize and close() calls it again then closes', () => {
    SqliteConnection.optimize();
    // It will use the existing connection and call pragma('optimize')
    expect(calls.db.pragma).to.include('optimize');

    SqliteConnection.close();
    // close increments close counter
    expect(calls.db.close).to.equal(1);
  });
});
