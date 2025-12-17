/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import SqliteConnection, { computeDbPath } from './SqliteConnection.js';
import logger from '../../services/logger.js';
import { getPackageVersion } from '../../utils.js';
import { runMigrations, listMigrationFiles } from './migrations/migrate.js';

/**
 * Lazily resolve and cache the AdmZip constructor via dynamic import.
 * This keeps startup costs low and avoids ESM/CJS interop pitfalls.
 * @returns {Promise<any>} AdmZip constructor (class)
 */
let _AdmZipSingleton = null;
async function getAdmZip() {
  if (_AdmZipSingleton) return _AdmZipSingleton;
  const mod = await import('adm-zip');
  _AdmZipSingleton = mod.default || mod;
  return _AdmZipSingleton;
}

/**
 * Extract numeric migration id from a migration file name like "12.add-users.js".
 * @param {string} name
 * @returns {number} Parsed id or 0 when not parsable
 */
function parseMigrationIdFromName(name) {
  if (typeof name !== 'string') return 0;
  const m = name.match(/^(\d+)\./);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Read the highest migration id from available migration files.
 * @returns {number} Highest migration id from files, or 0 when none.
 */
function getLatestMigrationIdFromFiles() {
  try {
    const files = listMigrationFiles();
    const ids = files.map((f) => f.id);
    return ids.length > 0 ? Math.max(...ids) : 0;
  } catch (e) {
    logger.warn('Failed to scan migrations directory:', e.message);
    return 0;
  }
}

/**
 * Inspect the current database and return the highest applied migration id.
 * @returns {number} Max id from schema_migrations, or 0 when table/rows are missing.
 */
function getCurrentDbMigration() {
  try {
    const exists = SqliteConnection.tableExists('schema_migrations');
    if (!exists) return 0;
    const rows = SqliteConnection.query('SELECT name FROM schema_migrations');
    if (!rows || rows.length === 0) return 0;
    return rows.reduce((max, r) => Math.max(max, parseMigrationIdFromName(r.name)), 0);
  } catch (e) {
    logger.warn('Failed to read current DB migration:', e.message);
    return 0;
  }
}

/**
 * Create a consistent SQLite snapshot using the native backup API into a temp folder.
 * @returns {Promise<{tempDir:string, backupPath:string}>}
 */
async function createTempBackupFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fredy-db-'));
  const backupPath = path.join(tempDir, 'listings.db');
  // Ensure connection is open and create a consistent snapshot
  const db = SqliteConnection.getConnection();
  await db.backup(backupPath);
  return { tempDir, backupPath };
}

/**
 * Build a zip buffer that contains the DB snapshot and metadata marker.
 * Files:
 * - listings.db
 * - fredy-backup.json { formatVersion, createdAt, dbMigration, fredyVersion }
 * @returns {Promise<Buffer>}
 */
async function buildBackupZipBuffer() {
  const { backupPath, tempDir } = await createTempBackupFile();
  try {
    const AdmZip = await getAdmZip();
    const zip = new AdmZip();
    const meta = {
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      dbMigration: getCurrentDbMigration(),
      fredyVersion: await getPackageVersion(),
    };
    // add files
    zip.addLocalFile(backupPath, '', 'listings.db');
    zip.addFile('fredy-backup.json', Buffer.from(JSON.stringify(meta, null, 2), 'utf-8'));
    return zip.toBuffer();
  } finally {
    // cleanup temp
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      logger.debug('Failed to cleanup temp backup dir:', e.message);
    }
  }
}

/**
 * Read and parse the metadata file from a backup zip buffer.
 * @param {Buffer} zipBuffer
 * @returns {Promise<any|null>} Parsed JSON or null when missing/invalid.
 */
async function readMetadataFromZip(zipBuffer) {
  const AdmZip = await getAdmZip();
  const zip = new AdmZip(zipBuffer);
  const entry = zip.getEntry('fredy-backup.json');
  if (!entry) return null;
  try {
    const txt = entry.getData().toString('utf-8');
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

/**
 * Check if a backup zip contains a listings.db entry.
 * @param {Buffer} zipBuffer
 * @returns {Promise<boolean>}
 */
async function hasListingsDbInZip(zipBuffer) {
  const AdmZip = await getAdmZip();
  const zip = new AdmZip(zipBuffer);
  return zip.getEntry('listings.db') != null || zip.getEntries().some((e) => /listings\.db$/i.test(e.entryName));
}

/**
 * Extract the listings.db from a backup zip buffer to a temp directory.
 * @param {Buffer} zipBuffer
 * @returns {Promise<{tempDir:string, dbPath:string}>}
 */
async function extractListingsDbToTemp(zipBuffer) {
  const AdmZip = await getAdmZip();
  const zip = new AdmZip(zipBuffer);
  const entry = zip.getEntry('listings.db') || zip.getEntries().find((e) => /listings\.db$/i.test(e.entryName));
  if (!entry) throw new Error('Backup zip does not contain listings.db');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fredy-restore-'));
  const outPath = path.join(tempDir, 'listings.db');
  fs.writeFileSync(outPath, entry.getData());
  return { tempDir, dbPath: outPath };
}

/**
 * Public: Create a backup zip buffer ready for download.
 * @returns {Promise<Buffer>}
 */
export async function createBackupZip() {
  return buildBackupZipBuffer();
}

/**
 * Analyze a backup zip for compatibility with the current codebase.
 * - Missing DB yields danger.
 * - Newer backup migration than required yields danger.
 * - Older backup yields warning but is considered compatible (auto-migrate).
 * - Equal version yields info.
 * @param {Buffer} zipBuffer
 * @returns {Promise<{compatible:boolean,severity:'danger'|'warning'|'info',message:string,backupMigration:number|null,requiredMigration:number,fredyVersion?:string|null}>>}
 */
export async function precheckRestore(zipBuffer) {
  if (!zipBuffer || zipBuffer.length === 0) {
    return {
      compatible: false,
      severity: 'danger',
      message: 'Empty upload',
      backupMigration: null,
      requiredMigration: getLatestMigrationIdFromFiles(),
    };
  }
  if (!(await hasListingsDbInZip(zipBuffer))) {
    return {
      compatible: false,
      severity: 'danger',
      message: 'Zip file is missing the database file (listings.db).',
      backupMigration: null,
      requiredMigration: getLatestMigrationIdFromFiles(),
    };
  }
  const meta = await readMetadataFromZip(zipBuffer);
  const requiredMigration = getLatestMigrationIdFromFiles();
  const backupMigration = meta?.dbMigration ?? null;
  const fredyVersion = meta?.fredyVersion ?? null;

  if (backupMigration == null) {
    return {
      compatible: false,
      severity: 'danger',
      message:
        'Backup metadata is missing the migration marker. Cannot validate compatibility. It is NOT advised to continue!',
      backupMigration,
      requiredMigration,
      fredyVersion,
    };
  }

  if (backupMigration > requiredMigration) {
    return {
      compatible: false,
      severity: 'danger',
      message:
        'Backup schema is newer than this Fredy version. Please upgrade Fredy to a version that supports this backup or proceed at your own risk.',
      backupMigration,
      requiredMigration,
      fredyVersion,
    };
  }

  if (backupMigration < requiredMigration) {
    return {
      compatible: true,
      severity: 'warning',
      message:
        'Backup contains an older database schema than this Fredy version requires. We will apply automatic migrations right after the restore to upgrade the database.',
      backupMigration,
      requiredMigration,
      fredyVersion,
    };
  }

  return {
    compatible: true,
    severity: 'info',
    message: 'Backup is compatible with the current Fredy version.',
    backupMigration,
    requiredMigration,
    fredyVersion,
  };
}

/**
 * Perform a restore from a validated backup zip.
 * - Optionally forces restore when incompatible.
 * - Replaces the on-disk DB and runs migrations when needed.
 * @param {Buffer} zipBuffer
 * @param {{force?:boolean}} [opts]
 * @returns {Promise<{restored:true,warning:string|null,details:any}>}
 * @throws Error with code 'INCOMPATIBLE' when not forced and incompatible
 */
export async function restoreFromZip(zipBuffer, { force = false } = {}) {
  const check = await precheckRestore(zipBuffer);
  if (!check.compatible && !force) {
    const err = new Error(check.message || 'Backup is incompatible');
    err.code = 'INCOMPATIBLE';
    err.payload = check;
    throw err;
  }

  const { dbPath } = await computeDbPath();
  const { tempDir, dbPath: tempDbPath } = await extractListingsDbToTemp(zipBuffer);

  try {
    // Close existing connection to allow file replacement
    SqliteConnection.close();

    // Backup existing DB file
    try {
      if (fs.existsSync(dbPath)) {
        const backupName = `${dbPath}.bak-${Date.now()}`;
        fs.copyFileSync(dbPath, backupName);
      }
    } catch (e) {
      logger.warn('Failed to create on-disk backup copy of current DB:', e.message);
    }

    // Replace DB with the one from the zip
    fs.copyFileSync(tempDbPath, dbPath);

    // Re-run migrations when needed
    if (check.backupMigration < check.requiredMigration) {
      await runMigrations();
    } else {
      // Ensure we can re-open the DB
      SqliteConnection.getConnection();
    }
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      logger.debug('Failed to cleanup temp restore dir:', e.message);
    }
  }

  return { restored: true, warning: check.severity !== 'info' ? check.message : null, details: check };
}

/**
 * Build the backup file name with current date and Fredy version.
 * Pattern: YYYY-MM-DD-FredyBackup-{version}.zip
 * @returns {Promise<string>}
 */
export async function buildBackupFileName() {
  const dt = new Date();
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const version = await getPackageVersion();
  return `${yyyy}-${mm}-${dd}-FredyBackup-${version}.zip`.replaceAll(' ', '');
}
