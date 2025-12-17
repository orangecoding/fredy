/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import logger from '../../services/logger.js';
import { readConfigFromStorage } from '../../utils.js';

/**
 * SqliteConnection
 * A small, high-performance wrapper around better-sqlite3 that provides a
 * singleton connection, sensible PRAGMA tuning, and helper methods. This
 * module is safe to import and reuse.
 *
 * Performance notes:
 * - journal_mode = WAL: allows concurrent readers with a single writer and
 *   yields better performance for server apps.
 * - synchronous = NORMAL: trades a bit of durability for significant speed
 *   while still being safe in most environments.
 * - cache_size = -64000: ~64MB page cache (negative value sets KB) to improve
 *   query performance for frequent reads.
 * - foreign_keys = ON: ensure referential integrity is enforced.
 * - optimize: runs SQLite's auto-analysis and purges internal caches. It is
 *   cheap; we call it at startup and before process exit. You can also call
 *   optimize() manually after large schema changes or bulk operations.
 */
class SqliteConnection {
  static #db = null;

  static #sqlLiteCfg = null;

  static async init() {
    if (this.#sqlLiteCfg == null) {
      readConfigFromStorage().then((c) => {
        this.#sqlLiteCfg = c.sqlitepath;
      });
    }
  }
  /**
   * Returns a singleton instance of better-sqlite3 Database.
   * Respects env var SQLITE_DB_PATH and defaults to db/listings.db.
   */
  static getConnection() {
    if (this.#db) return this.#db;

    if (this.#sqlLiteCfg == null) {
      logger.warn('No sqlitepath configured. Using default db/listings.db');
    }

    // Interpret config.sqlitepath as a directory relative to project root when it starts with '/'
    const rawDir = this.#sqlLiteCfg && this.#sqlLiteCfg.length > 0 ? this.#sqlLiteCfg : '/db';
    const relDir = rawDir.startsWith('/') ? rawDir.slice(1) : rawDir;
    const absDir = path.isAbsolute(relDir) ? relDir : path.join(process.cwd(), relDir);
    const dbPath = path.join(absDir, 'listings.db');

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Open the database synchronously (better-sqlite3 is sync and very fast)
    this.#db = new Database(dbPath, { verbose: undefined });

    // Apply high-performance PRAGMA's
    try {
      this.#db.pragma('journal_mode = WAL');
      this.#db.pragma('synchronous = NORMAL');
      this.#db.pragma('cache_size = -64000');
      this.#db.pragma('foreign_keys = ON');
      this.#db.pragma('optimize');
    } catch (e) {
      logger.warn('Failed to apply one or more PRAGMAs:', e.message);
    }

    // Run optimize on exit to persist analysis and cleanup internal caches.
    process.once('beforeExit', () => {
      try {
        this.#db?.pragma('optimize');
      } catch (e) {
        logger.debug('PRAGMA optimize on exit failed:', e.message);
      }
    });

    return this.#db;
  }

  /**
   * Execute a write statement (INSERT/UPDATE/DELETE/DDL). Returns better-sqlite3 run info.
   */
  static execute(sql, params = {}) {
    const db = this.getConnection();
    return db.prepare(sql).run(params);
  }

  /**
   * Execute a query and returns all rows.
   */
  static query(sql, params = {}) {
    const db = this.getConnection();
    return db.prepare(sql).all(params);
  }

  /**
   * Check whether a table exists.
   */
  static tableExists(tableName) {
    const db = this.getConnection();
    const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
    return !!row;
  }

  /**
   * Run the given callback inside a transaction. The callback receives the Database instance.
   * If the callback throws, the transaction is rolled back and the error re-thrown.
   */
  static withTransaction(callback) {
    const db = this.getConnection();
    const trx = db.transaction((cb) => cb(db));
    return trx(callback);
  }

  /**
   * Run SQLite PRAGMA optimize. See https://sqlite.org/pragma.html#pragma_optimize
   *
   * Explanation: PRAGMA optimize triggers internal housekeeping, such as
   * recomputing query planner statistics (similar to ANALYZE) when appropriate
   * and purging unused pages from caches. It is inexpensive and can improve
   * performance after schema changes or heavy write activity.
   */
  static optimize() {
    const db = this.getConnection();
    try {
      db.pragma('optimize');
    } catch (e) {
      logger.warn('PRAGMA optimize failed:', e.message);
    }
  }

  /**
   * Close the database connection. Typically not needed for long-running apps.
   */
  static close() {
    if (this.#db) {
      try {
        this.#db.pragma('optimize');
      } catch (e) {
        logger.debug('PRAGMA optimize before close failed:', e.message);
      }
      this.#db.close();
      this.#db = null;
    }
  }
}

export default SqliteConnection;

// Centralized DB path computation to avoid duplication across modules
// Returns: { dir, dbPath }
/**
 * Compute the absolute SQLite database directory and file path based on configuration.
 * Ensures the directory exists on disk.
 * @returns {Promise<{dir:string, dbPath:string}>} Absolute directory and database file path.
 */
export async function computeDbPath() {
  const cfg = await readConfigFromStorage();
  const rawDir = cfg?.sqlitepath && cfg.sqlitepath.length > 0 ? cfg.sqlitepath : '/db';
  const relDir = rawDir.startsWith('/') ? rawDir.slice(1) : rawDir;
  const absDir = path.isAbsolute(relDir) ? relDir : path.join(process.cwd(), relDir);
  const dbPath = path.join(absDir, 'listings.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return { dir: absDir, dbPath };
}
