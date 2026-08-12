/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import {
  assertAdapterFieldsAllowed,
  assertPrivilegedFieldsUnchanged,
  PRIVILEGED_ADAPTER_FIELDS,
} from '../../lib/services/security/adapterFields.js';

describe('privileged notification adapter fields', () => {
  it('treats the sqlite dbPath as privileged', () => {
    expect(PRIVILEGED_ADAPTER_FIELDS.sqlite).toContain('dbPath');
  });

  describe('assertPrivilegedFieldsUnchanged (channel save)', () => {
    it('lets an admin set anything', () => {
      expect(assertPrivilegedFieldsUnchanged('sqlite', { dbPath: '/etc/x.db' }, {}, true).ok).toBe(true);
    });

    it('rejects a non-admin introducing the field', () => {
      expect(assertPrivilegedFieldsUnchanged('sqlite', { dbPath: '/etc/x.db' }, {}, false)).toMatchObject({
        ok: false,
        adapterId: 'sqlite',
        field: 'dbPath',
      });
    });

    it('allows a non-admin echoing back the stored value unchanged', () => {
      expect(
        assertPrivilegedFieldsUnchanged('sqlite', { dbPath: 'listings.db' }, { dbPath: 'listings.db' }, false).ok,
      ).toBe(true);
    });

    it('treats an empty value as not setting the field', () => {
      expect(assertPrivilegedFieldsUnchanged('sqlite', { dbPath: '' }, {}, false).ok).toBe(true);
    });

    it('ignores adapters without privileged fields', () => {
      expect(assertPrivilegedFieldsUnchanged('slack', { token: 'x' }, {}, false).ok).toBe(true);
    });
  });

  describe('assertAdapterFieldsAllowed (adapter test-fire)', () => {
    it('lets an admin through', () => {
      expect(assertAdapterFieldsAllowed('sqlite', { dbPath: { value: '/tmp/x.db' } }, true).ok).toBe(true);
    });

    it('rejects a non-admin setting dbPath', () => {
      const result = assertAdapterFieldsAllowed('sqlite', { dbPath: { value: '/tmp/x.db' } }, false);
      expect(result).toMatchObject({ ok: false, adapterId: 'sqlite', field: 'dbPath' });
    });

    it('accepts a plain (unwrapped) value too', () => {
      expect(assertAdapterFieldsAllowed('sqlite', { dbPath: '/tmp/x.db' }, false).ok).toBe(false);
    });

    it('treats an empty or absent value as not set', () => {
      expect(assertAdapterFieldsAllowed('sqlite', { dbPath: { value: '' } }, false).ok).toBe(true);
      expect(assertAdapterFieldsAllowed('sqlite', {}, false).ok).toBe(true);
      expect(assertAdapterFieldsAllowed('sqlite', undefined, false).ok).toBe(true);
    });

    it('lets non-privileged adapters through for anyone', () => {
      expect(assertAdapterFieldsAllowed('ntfy', { topic: { value: 'flats' } }, false).ok).toBe(true);
    });
  });

  describe('sqlite adapter path containment', () => {
    /**
     * The adapter resolves against the configured sqlite directory, so the test pins that
     * directory rather than relying on the ambient config.
     * @returns {Promise<typeof import('../../lib/notification/adapter/sqlite.js')>}
     */
    async function loadAdapter(dir = '/tmp/fredy-db') {
      vi.resetModules();
      vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
        default: {},
        computeDbPath: async () => ({ dir, dbPath: path.join(dir, 'listings.db') }),
      }));
      return import('../../lib/notification/adapter/sqlite.js');
    }

    it('resolves a bare file name inside the database directory', async () => {
      const { resolveDbPath } = await loadAdapter();
      expect(await resolveDbPath('notifications.db')).toBe('/tmp/fredy-db/notifications.db');
    });

    it('defaults to listings.db', async () => {
      const { resolveDbPath } = await loadAdapter();
      expect(await resolveDbPath(undefined)).toBe('/tmp/fredy-db/listings.db');
      expect(await resolveDbPath('   ')).toBe('/tmp/fredy-db/listings.db');
    });

    it('rejects an absolute path outside the database directory', async () => {
      const { resolveDbPath } = await loadAdapter();
      await expect(resolveDbPath('/etc/cron.d/payload')).rejects.toThrow(/may only write inside/);
    });

    it('rejects traversal out of the database directory', async () => {
      const { resolveDbPath } = await loadAdapter();
      await expect(resolveDbPath('../../etc/payload.db')).rejects.toThrow(/may only write inside/);
    });

    it('allows a nested path below the database directory', async () => {
      const { resolveDbPath } = await loadAdapter();
      expect(await resolveDbPath('exports/2026.db')).toBe('/tmp/fredy-db/exports/2026.db');
    });

    it('does not treat a sibling directory with the same prefix as inside', async () => {
      const { resolveDbPath } = await loadAdapter();
      await expect(resolveDbPath('../fredy-db-evil/x.db')).rejects.toThrow(/may only write inside/);
    });
  });
});
