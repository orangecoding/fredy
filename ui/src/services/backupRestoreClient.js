/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Lightweight client for Backup & Restore interactions with the backend.
 *
 * Usage (in React components):
 * ```js
 * import { downloadBackup, precheckRestore, restore } from '../../services/backupRestoreClient';
 * await downloadBackup();
 * const info = await precheckRestore(file);
 * await restore(file, false);
 * ```
 */

function extractFileNameFromDisposition(disposition) {
  const dispo = disposition || '';
  const match = dispo.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/);
  return decodeURIComponent(match?.[1] || match?.[2] || 'FredyBackup.zip');
}

export class BackupRestoreClient {
  /**
   * Trigger a backup download and save it using the filename provided by the server.
   * @returns {Promise<void>}
   */
  static async downloadBackup() {
    const resp = await fetch('/api/admin/backup', { credentials: 'include' });
    if (!resp.ok) throw new Error('Failed to create backup');
    const blob = await resp.blob();
    const fileName = extractFileNameFromDisposition(resp.headers.get('Content-Disposition'));
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  /**
   * Upload a backup zip for analysis without restoring.
   * @param {Blob|ArrayBuffer|Buffer} file - Backup zip content.
   * @returns {Promise<{compatible:boolean,severity:string,message:string,backupMigration:number|null,requiredMigration:number,fredyVersion?:string|null}>>}
   */
  static async precheckRestore(file) {
    const resp = await fetch('/api/admin/backup/restore?dryRun=true', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/zip' },
      body: file,
    });
    return resp.json();
  }

  /**
   * Perform a database restore from a backup zip.
   * @param {Blob|ArrayBuffer|Buffer} file - Backup zip content.
   * @param {boolean} force - When true, proceed even if reported incompatible.
   * @returns {Promise<{restored:true,warning:string|null,details:any}>}
   */
  static async restore(file, force) {
    const resp = await fetch(`/api/admin/backup/restore?force=${force ? 'true' : 'false'}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/zip' },
      body: file,
    });
    const data = await resp.json();
    if (!resp.ok) {
      const err = new Error(data?.message || 'Restore failed');
      err.payload = data;
      throw err;
    }
    return data;
  }
}

// Convenience named exports
export const downloadBackup = (...args) => BackupRestoreClient.downloadBackup(...args);
export const precheckRestore = (...args) => BackupRestoreClient.precheckRestore(...args);
export const restore = (...args) => BackupRestoreClient.restore(...args);
