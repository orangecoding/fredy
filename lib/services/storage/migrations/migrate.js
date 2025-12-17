/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Migration Runner for better-sqlite3
 * I know there are external libs out there, but
 * a) most of them are pretty bloated
 * b) I wanted to have something that fit's this limited use-case
 * c) I was searching for justifications anyway to build a migration system on my own. Don't judge me ;)
 *
 * Executes all migration files in lib/services/storage/migrations/sql in natural order.
 * Each migration runs in its own transaction. If a migration fails, only that
 * migration is rolled back and the process stops with a non-zero exit code.
 * Already applied migrations are skipped using the schema_migrations table.
 *
 * Usage:
 *   CLI: yarn run migratedb
 *   Programmatic:
 *     import { runMigrations } from './lib/services/storage/migrations/migrate.js';
 *     await runMigrations();
 *
 * Migration file format (example: lib/services/storage/migrations/sql/1.add-users.js):
 *   export function up(db) {
 *     db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
 *   }
 *
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import crypto from 'crypto';
import SqliteConnection from '../SqliteConnection.js';
import logger from '../../logger.js';

const ROOT = path.resolve('.');
/**
 * Absolute path to the migrations directory (lib/services/storage/migrations/sql).
 * @type {string}
 */
export const MIGRATIONS_DIR = path.join(ROOT, 'lib', 'services', 'storage', 'migrations', 'sql');

/**
 * Ensures that the given directory exists, creating it recursively if needed.
 * @param {string} p - Path to the directory.
 */
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/**
 * Lists all migration files in the migrations directory.
 * Migration files must follow the format: <number>.<label>.js
 * @returns {Array<{id:number, name:string, label:string, path:string}>}
 */
export function listMigrationFiles() {
  ensureDir(MIGRATIONS_DIR);
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+\..+\.js$/.test(f))
    .map((file) => {
      const [idStr, ...rest] = file.split('.');
      const id = Number.parseInt(idStr, 10);
      const label = rest.slice(0, -1).join('.');
      const fullPath = path.join(MIGRATIONS_DIR, file);
      return { id, name: file, label, path: fullPath };
    })
    .sort((a, b) => (a.id === b.id ? a.name.localeCompare(b.name) : a.id - b.id));
}

/**
 * Calculates the SHA-256 checksum of a file.
 * @param {string} filePath - Path to the file.
 * @returns {string} Hex-encoded checksum.
 */
function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Dynamically imports a migration module and returns its `up` function.
 * @param {string} filePath - Path to the migration file.
 * @returns {Promise<Function>} Migration function.
 * @throws {Error} If the migration file does not export a valid function.
 */
async function loadMigrationModule(filePath) {
  const testImporter = globalThis.__TEST_MIGRATE_IMPORT__;
  const url = pathToFileURL(filePath);
  const mod = testImporter ? await testImporter(filePath, url) : await import(url.href);
  const fn = mod.up || mod.default;
  if (typeof fn !== 'function') {
    throw new Error(`Migration ${filePath} must export function up(db) or default function(db)`);
  }
  return fn;
}

/**
 * Loads all previously executed migrations from the database.
 * @returns {Map<string,string>} Map of migration name to checksum.
 */
function loadExecutedMigrations() {
  const executed = new Map();
  const hasTable = SqliteConnection.tableExists('schema_migrations');
  if (!hasTable) return executed;
  const rows = SqliteConnection.query('SELECT name, checksum FROM schema_migrations ORDER BY applied_at ASC');
  for (const r of rows) executed.set(r.name, r.checksum);
  return executed;
}

/**
 * Executes all pending migrations.
 * Ensures that each migration runs inside its own transaction.
 * Already applied migrations are skipped, unless checksum updates are allowed.
 * On success, updates the schema_migrations table and runs PRAGMA optimize.
 */
export async function runMigrations() {
  ensureDir(path.join(ROOT, 'db'));
  ensureDir(MIGRATIONS_DIR);

  const files = listMigrationFiles();
  if (files.length === 0) {
    logger.info('No migration files found under', MIGRATIONS_DIR);
    return;
  }

  SqliteConnection.getConnection();

  const executed = loadExecutedMigrations();

  let appliedMigrations = 0;
  for (const m of files) {
    const checksum = sha256File(m.path);

    if (executed.has(m.name)) {
      const prev = executed.get(m.name);
      if (prev !== checksum) {
        logger.info(`Mismatch found in migration ${m.name}. Fixing.`);
        SqliteConnection.execute('UPDATE schema_migrations SET checksum = @checksum WHERE name = @name', {
          checksum,
          name: m.name,
        });
        executed.set(m.name, checksum);
      }
      continue;
    }

    appliedMigrations++;
    logger.info(`Applying migration: ${m.name}`);
    const fn = await loadMigrationModule(m.path);

    try {
      let duration = 0;
      SqliteConnection.withTransaction((db) => {
        const t0 = Date.now();
        fn(db);
        duration = Date.now() - t0;
        db.prepare(
          "INSERT INTO schema_migrations (name, checksum, applied_at, duration_ms) VALUES (?, ?, datetime('now'), ?)",
        ).run(m.name, checksum, duration);
      });
      logger.info(`Migration applied: ${m.name} (${duration} ms)`);
    } catch (e) {
      logger.error(`Migration failed and was rolled back: ${m.name}`, e);
      process.exitCode = 1;
      return;
    }
  }

  SqliteConnection.optimize();
  if (appliedMigrations > 0) {
    logger.info('All migrations completed successfully.');
  }
}

/**
 * Detects whether the current file is being executed directly via Node.js.
 * This allows `node lib/services/storage/migrations/migrate.js` to run migrations directly.
 * @returns {boolean} True if the file was run directly.
 */
const isDirectRun = (() => {
  try {
    const thisFile = import.meta.url;
    const invoked = pathToFileURL(process.argv[1] || '').href;
    return thisFile === invoked;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  await runMigrations();
}
