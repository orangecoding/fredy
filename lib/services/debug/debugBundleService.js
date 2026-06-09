/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import os from 'os';
import { getAllDebugLogs } from './debugLogStorage.js';
import { getPackageVersion } from '../../utils.js';

const LOGS_FILE_NAME = 'logs.txt';
const SYSTEM_INFO_FILE_NAME = 'sys.txt';
const DEBUG_FILE_PREFIX = 'FredyDebug-';

/**
 * Lazily resolve AdmZip via dynamic import so tests can swap it via globalThis.
 * Mirrors the pattern used by backupRestoreService.js for consistency.
 * @returns {Promise<any>}
 */
let _AdmZipSingleton = null;
async function getAdmZip() {
  if (_AdmZipSingleton) return _AdmZipSingleton;
  if (globalThis && globalThis.__TEST_ADM_ZIP__) {
    _AdmZipSingleton = globalThis.__TEST_ADM_ZIP__;
    return _AdmZipSingleton;
  }
  const mod = await import('adm-zip');
  _AdmZipSingleton = (mod && mod.default) || mod;
  return _AdmZipSingleton;
}

/**
 * Format a Date as YYYY-MM-DD using local time. Used for the download filename.
 * @param {Date} date
 * @returns {string}
 */
function formatDateOnly(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Build the debug bundle filename, e.g. "2026-06-08-FredyDebug-22.5.0.zip".
 * @returns {Promise<string>}
 */
export async function buildDebugBundleFileName() {
  const version = await getPackageVersion();
  return `${formatDateOnly(new Date())}-${DEBUG_FILE_PREFIX}${version}.zip`;
}

/**
 * Format a stored debug_logs row into a single text line. The format mirrors the
 * console layout from logger.js so support staff sees familiar output:
 *   [YYYY-MM-DD HH:MM:SS] LEVEL: message
 *
 * @param {{ts:number, level:string, message:string}} row
 * @returns {string}
 */
function formatLogLine(row) {
  const d = new Date(row.ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const level = String(row.level || 'info').toUpperCase();
  return `[${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}] ${level}: ${row.message}`;
}

/**
 * Render every stored debug log row into a single newline-delimited text blob.
 * Returns an empty string when there are no rows.
 *
 * @returns {string}
 */
export function renderLogsTxt() {
  const rows = getAllDebugLogs();
  if (!rows || rows.length === 0) return '';
  return rows.map(formatLogLine).join('\n') + '\n';
}

/**
 * Best-effort Docker detection. Used as a context hint in sys.txt so issue triage
 * knows whether the user runs the official container image.
 *
 * @returns {{inDocker:boolean, evidence:string[]}}
 */
function detectDocker() {
  const evidence = [];
  let inDocker = false;

  if (process.env.FREDY_IN_DOCKER === 'true' || process.env.FREDY_IN_DOCKER === '1') {
    inDocker = true;
    evidence.push('FREDY_IN_DOCKER env var is set');
  }
  try {
    if (fs.existsSync('/.dockerenv')) {
      inDocker = true;
      evidence.push('/.dockerenv exists');
    }
  } catch {
    // ignore
  }
  try {
    if (fs.existsSync('/proc/1/cgroup')) {
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf-8');
      if (/docker|containerd|kubepods/i.test(cgroup)) {
        inDocker = true;
        evidence.push('/proc/1/cgroup mentions a container runtime');
      }
    }
  } catch {
    // ignore
  }
  return { inDocker, evidence };
}

/**
 * Strip credentials from URL-like strings so they can safely appear in sys.txt.
 * Returns the input unchanged for non-URL values.
 * @param {string} value
 * @returns {string}
 */
function sanitizeUrlLike(value) {
  if (typeof value !== 'string' || value.length === 0) return value;
  try {
    const u = new URL(value);
    if (u.username || u.password) {
      u.username = '***';
      u.password = '***';
    }
    return u.toString();
  } catch {
    return value;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return String(bytes);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return String(seconds);
  const s = Math.floor(seconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

/**
 * Build a plaintext system / runtime report for inclusion in the debug zip. Settings
 * are sanitized, proxy URL credentials and session secrets are stripped before
 * serialization.
 *
 * @param {object} [options]
 * @param {object} [options.settings]
 * @returns {Promise<string>}
 */
export async function buildSystemInfo({ settings = null } = {}) {
  const fredyVersion = await getPackageVersion();
  const docker = detectDocker();
  const cpus = os.cpus() || [];
  const procMem = process.memoryUsage();

  const lines = [];
  lines.push('# Fredy Debug Report');
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('## Application');
  lines.push(`Fredy version:     ${fredyVersion}`);
  lines.push(`Node.js version:   ${process.version}`);
  lines.push(`Process uptime:    ${formatDuration(process.uptime())}`);
  lines.push(`PID:               ${process.pid}`);
  lines.push(`Env (NODE_ENV):    ${process.env.NODE_ENV || 'development'}`);
  lines.push('');

  lines.push('## Operating System');
  lines.push(`Platform:          ${process.platform}`);
  lines.push(`Architecture:      ${process.arch}`);
  lines.push(`OS type:           ${os.type()}`);
  lines.push(`OS release:        ${os.release()}`);
  lines.push(`OS version:        ${typeof os.version === 'function' ? os.version() : 'n/a'}`);
  lines.push(`Hostname:          ${os.hostname()}`);
  lines.push(`System uptime:     ${formatDuration(os.uptime())}`);
  lines.push('');

  lines.push('## Container');
  lines.push(`Running in Docker: ${docker.inDocker ? 'yes' : 'no'}`);
  if (docker.evidence.length > 0) {
    lines.push(`Evidence:          ${docker.evidence.join('; ')}`);
  }
  if (process.env.FREDY_IMAGE_TAG) {
    lines.push(`Image tag:         ${process.env.FREDY_IMAGE_TAG}`);
  }
  lines.push('');

  lines.push('## Hardware');
  lines.push(`CPU count:         ${cpus.length}`);
  lines.push(`CPU model:         ${cpus[0]?.model || 'unknown'}`);
  lines.push(`Total memory:      ${formatBytes(os.totalmem())}`);
  lines.push(`Free memory:       ${formatBytes(os.freemem())}`);
  lines.push(`Process RSS:       ${formatBytes(procMem.rss)}`);
  lines.push(`Process heapUsed:  ${formatBytes(procMem.heapUsed)}`);
  lines.push(`Process heapTotal: ${formatBytes(procMem.heapTotal)}`);
  lines.push('');

  if (settings && typeof settings === 'object') {
    lines.push('## Settings (sanitized)');
    const safe = { ...settings };
    if (safe.proxyUrl) safe.proxyUrl = sanitizeUrlLike(safe.proxyUrl);
    delete safe.session_secret;
    delete safe.sessionSecret;
    for (const [key, value] of Object.entries(safe)) {
      let printed;
      if (value == null) {
        printed = 'null';
      } else if (typeof value === 'object') {
        try {
          printed = JSON.stringify(value);
        } catch {
          printed = String(value);
        }
      } else {
        printed = String(value);
      }
      lines.push(`${key}: ${printed}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build the final debug bundle zip buffer (logs.txt + sys.txt). The caller is
 * responsible for checking wasEverEnabled() before invoking this, we still produce
 * a valid zip even when there are zero log rows (logs.txt will contain a placeholder)
 * because the route layer handles the user-friendly 409 case.
 *
 * @param {object} [options]
 * @param {object} [options.settings] Runtime settings to embed in sys.txt.
 * @returns {Promise<Buffer>}
 */
export async function buildDebugBundleZip({ settings = null } = {}) {
  const logsContent = renderLogsTxt() || 'No debug log entries are currently stored.\n';
  const sysContent = await buildSystemInfo({ settings });

  const AdmZip = await getAdmZip();
  const zip = new AdmZip();
  zip.addFile(LOGS_FILE_NAME, Buffer.from(logsContent, 'utf-8'));
  zip.addFile(SYSTEM_INFO_FILE_NAME, Buffer.from(sysContent, 'utf-8'));
  return zip.toBuffer();
}
