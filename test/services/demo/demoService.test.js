/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const jobStoragePath = root + '/lib/services/storage/jobStorage.js';
const userStoragePath = root + '/lib/services/storage/userStorage.js';
const settingsStoragePath = root + '/lib/services/storage/settingsStorage.js';
const listingsStoragePath = root + '/lib/services/storage/listingsStorage.js';
const sqlitePath = root + '/lib/services/storage/SqliteConnection.js';
const geocodingCronPath = root + '/lib/services/crons/geocoding-cron.js';
const loggerPath = root + '/lib/services/logger.js';
const configuredAdapterStoragePath = root + '/lib/services/storage/configuredAdapterStorage.js';

/** Mutable state the mocked storages read from and write into. */
let state;

const provider = (id, name) => ({ metaInformation: { id, name } });

async function loadService() {
  vi.resetModules();
  vi.doMock(jobStoragePath, () => ({
    upsertJob: (job) => {
      state.jobs[job.jobId] = { ...(state.jobs[job.jobId] || {}), ...job, id: job.jobId };
      return job.jobId;
    },
    getJob: (id) => state.jobs[id] || null,
    getJobs: () => Object.values(state.jobs),
    removeJob: (id) => {
      delete state.jobs[id];
    },
  }));
  vi.doMock(userStoragePath, () => ({
    ADMIN_USERNAME: 'admin',
    DEFAULT_ADMIN_PASSWORD: 'admin',
    DEMO_USERNAME: 'demo',
    DEMO_PASSWORD: 'demo',
    // getUsers() no longer hands out credentials; anything that needs the stored hash asks for it
    // explicitly through getUserWithSecretsByUsername().
    getUsers: () => state.users.map((user) => ({ ...user, password: undefined })),
    getUserWithSecretsByUsername: (username) => state.users.find((user) => user.username === username) ?? null,
  }));
  vi.doMock(settingsStoragePath, () => ({
    getSettings: async () => state.settings,
    getUserSettings: (userId) => state.userSettings[userId] || {},
    // Mirrors the real storage: a null value deletes the row rather than storing null.
    upsertSettings: (map, userId) => {
      const next = { ...(state.userSettings[userId] || {}) };
      for (const [name, value] of Object.entries(map)) {
        if (value === null) {
          delete next[name];
        } else {
          next[name] = value;
        }
      }
      state.userSettings[userId] = next;
    },
  }));
  vi.doMock(listingsStoragePath, () => ({
    deleteInactiveListingsByJobId: (jobId) => {
      state.inactiveDeletes.push(jobId);
    },
  }));
  vi.doMock(sqlitePath, () => ({
    default: { withTransaction: (cb) => cb() },
  }));
  vi.doMock(geocodingCronPath, () => ({
    runGeoCordTask: () => {
      state.geoTaskRuns += 1;
    },
  }));
  vi.doMock(configuredAdapterStoragePath, () => ({
    VISIBILITY: { PRIVATE: 'private', ADMIN: 'admin', EVERYONE: 'everyone' },
    getAllChannels: () => state.channels,
    upsertChannel: (channel) => {
      const id = channel.id || `channel-${state.channels.length + 1}`;
      state.channels.push({ ...channel, id });
      return id;
    },
  }));
  vi.doMock(loggerPath, () => ({
    default: {
      debug: () => {},
      info: () => {},
      warn: (...args) => state.warnings.push(args.join(' ')),
      error: () => {},
    },
  }));
  return import(root + '/lib/services/demo/demoService.js');
}

describe('services/demo/demoService', () => {
  beforeEach(() => {
    state = {
      jobs: {},
      users: [{ id: 'u-demo', username: 'demo', isAdmin: false, password: 'irrelevant' }],
      userSettings: {},
      settings: { demoMode: true },
      inactiveDeletes: [],
      warnings: [],
      geoTaskRuns: 0,
      channels: [],
    };
  });

  describe('isDemoJob', () => {
    it('matches only the fixed demo job id', async () => {
      const { isDemoJob, DEMO_JOB_ID } = await loadService();

      expect(isDemoJob(DEMO_JOB_ID)).toBe(true);
      expect(isDemoJob('something-else')).toBe(false);
      expect(isDemoJob(null)).toBe(false);
    });

    it('does not match a user job that merely carries the demo name', async () => {
      const { isDemoJob, DEMO_JOB_NAME } = await loadService();

      expect(isDemoJob(DEMO_JOB_NAME)).toBe(false);
    });
  });

  describe('seedDemoJob', () => {
    it('creates the demo job with a channel referencing the demo adapter and dealType rent', async () => {
      const { seedDemoJob, DEMO_JOB_ID, DEMO_JOB_NAME } = await loadService();

      await seedDemoJob([provider('immoscout', 'Immoscout'), provider('kleinanzeigen', 'Kleinanzeigen')]);

      const job = state.jobs[DEMO_JOB_ID];
      expect(job.name).toBe(DEMO_JOB_NAME);
      expect(job.userId).toBe('u-demo');
      expect(job.enabled).toBe(true);
      expect(job.dealType).toBe('rent');
      expect(job.notificationAdapter).toEqual([{ configuredAdapterId: 'channel-1' }]);
      expect(state.channels).toEqual([
        { id: 'channel-1', userId: 'u-demo', adapterId: 'demo', name: 'Demo', fields: {}, visibility: 'private' },
      ]);
      expect(job.provider).toHaveLength(2);
      expect(job.provider[0]).toEqual({
        id: 'immoscout',
        name: 'Immoscout',
        url: expect.stringContaining('immobilienscout24.de'),
        enabled: true,
      });
    });

    it('reuses the demo channel on a repeat seeding instead of creating a duplicate', async () => {
      const { seedDemoJob, DEMO_JOB_ID } = await loadService();

      await seedDemoJob([provider('immoscout', 'Immoscout')]);
      await seedDemoJob([provider('immoscout', 'Immoscout')]);

      expect(state.channels).toHaveLength(1);
      expect(state.jobs[DEMO_JOB_ID].notificationAdapter).toEqual([{ configuredAdapterId: 'channel-1' }]);
    });

    it('skips a provider module that has no demo url', async () => {
      const { seedDemoJob, DEMO_JOB_ID } = await loadService();

      await seedDemoJob([provider('immoscout', 'Immoscout'), provider('doesNotExist', 'Nope')]);

      expect(state.jobs[DEMO_JOB_ID].provider.map((p) => p.id)).toEqual(['immoscout']);
    });

    it('repairs a drifted demo job without changing its id or owner', async () => {
      const { seedDemoJob, DEMO_JOB_ID } = await loadService();
      state.jobs[DEMO_JOB_ID] = {
        id: DEMO_JOB_ID,
        userId: 'u-demo',
        name: 'Renamed',
        enabled: false,
        provider: [],
        notificationAdapter: [{ id: 'slack', fields: { token: 'x' } }],
      };

      await seedDemoJob([provider('immoscout', 'Immoscout')]);

      expect(Object.keys(state.jobs)).toEqual([DEMO_JOB_ID]);
      expect(state.jobs[DEMO_JOB_ID].userId).toBe('u-demo');
      expect(state.jobs[DEMO_JOB_ID].enabled).toBe(true);
      expect(state.jobs[DEMO_JOB_ID].notificationAdapter).toEqual([{ configuredAdapterId: 'channel-1' }]);
      expect(state.jobs[DEMO_JOB_ID].provider).toHaveLength(1);
    });

    it('does nothing when demo mode is off', async () => {
      state.settings.demoMode = false;
      const { seedDemoJob } = await loadService();

      await seedDemoJob([provider('immoscout', 'Immoscout')]);

      expect(state.jobs).toEqual({});
    });

    it('does nothing when there is no demo user', async () => {
      state.users = [{ id: 'u-admin', username: 'admin', isAdmin: true }];
      const { seedDemoJob } = await loadService();

      await seedDemoJob([provider('immoscout', 'Immoscout')]);

      expect(state.jobs).toEqual({});
    });
  });

  describe('seedDemoFinanceProfile', () => {
    it('seeds a rent profile whose affordable cold rent is exactly 1200', async () => {
      const { seedDemoFinanceProfile } = await loadService();
      const { rentThresholds, isRentProfileComplete } = await import(root + '/lib/services/finance/affordability.js');

      await seedDemoFinanceProfile();

      const profile = state.userSettings['u-demo'].finance_profile;
      expect(isRentProfileComplete(profile)).toBe(true);
      expect(rentThresholds(profile).affordableMaxRent).toBe(1200);
    });

    it('does nothing when demo mode is off', async () => {
      state.settings.demoMode = false;
      const { seedDemoFinanceProfile } = await loadService();

      await seedDemoFinanceProfile();

      expect(state.userSettings['u-demo']).toBeUndefined();
    });
  });

  describe('seedDemoHomeAddress', () => {
    it('seeds the Düsseldorf address with its hardcoded coordinates', async () => {
      const { seedDemoHomeAddress } = await loadService();

      await seedDemoHomeAddress();

      expect(state.userSettings['u-demo'].home_addresses).toEqual([
        {
          label: 'Zuhause',
          address: 'Adlerstraße, Pempelfort, Stadtbezirk 1, Düsseldorf, Nordrhein-Westfalen, 40211, Deutschland',
          coords: { lat: 51.230581, lng: 6.793402 },
        },
      ]);
      expect(state.geoTaskRuns).toBe(1);
    });

    it('does nothing when demo mode is off', async () => {
      state.settings.demoMode = false;
      const { seedDemoHomeAddress } = await loadService();

      await seedDemoHomeAddress();

      expect(state.userSettings['u-demo']).toBeUndefined();
      expect(state.geoTaskRuns).toBe(0);
    });
  });

  describe('resetDemoUserPreferences', () => {
    it('drops every preference a demo visitor could have changed', async () => {
      state.userSettings['u-demo'] = {
        theme: 'light',
        language: 'de',
        jobs_view_mode: 'table',
        listings_view_mode: 'table',
      };
      const { resetDemoUserPreferences } = await loadService();

      await resetDemoUserPreferences();

      expect(state.userSettings['u-demo']).toEqual({});
    });

    it('leaves the seeded settings alone', async () => {
      state.userSettings['u-demo'] = { theme: 'light', finance_profile: { seeded: true }, home_addresses: [] };
      const { resetDemoUserPreferences } = await loadService();

      await resetDemoUserPreferences();

      expect(state.userSettings['u-demo']).toEqual({ finance_profile: { seeded: true }, home_addresses: [] });
    });

    it('does nothing when demo mode is off', async () => {
      state.settings.demoMode = false;
      state.userSettings['u-demo'] = { theme: 'light' };
      const { resetDemoUserPreferences } = await loadService();

      await resetDemoUserPreferences();

      expect(state.userSettings['u-demo']).toEqual({ theme: 'light' });
    });

    it('does nothing when there is no demo user', async () => {
      state.users = [];
      const { resetDemoUserPreferences } = await loadService();

      await resetDemoUserPreferences();

      expect(state.userSettings['u-demo']).toBeUndefined();
    });
  });

  describe('seedDemo', () => {
    it('runs every seeder and resets the demo user preferences', async () => {
      state.userSettings['u-demo'] = { theme: 'light', language: 'de' };
      const { seedDemo, DEMO_JOB_ID } = await loadService();

      await seedDemo([provider('immoscout', 'Immoscout')]);

      expect(state.jobs[DEMO_JOB_ID]).toBeDefined();
      expect(state.userSettings['u-demo'].finance_profile).toBeDefined();
      expect(state.userSettings['u-demo'].home_addresses).toBeDefined();
      expect(state.userSettings['u-demo'].theme).toBeUndefined();
      expect(state.userSettings['u-demo'].language).toBeUndefined();
    });
  });

  describe('warnOnDefaultAdminPassword', () => {
    /** Build a real scrypt hash so the check is exercised end to end. */
    async function hashOf(plain) {
      const { hash } = await import(root + '/lib/services/security/hash.js');
      return hash(plain);
    }

    it('warns when the admin password is still "admin"', async () => {
      const { warnOnDefaultAdminPassword } = await loadService();
      state.users.push({ id: 'u-admin', username: 'admin', isAdmin: true, password: await hashOf('admin') });

      const warned = await warnOnDefaultAdminPassword();

      expect(warned).toBe(true);
      expect(state.warnings.join('\n')).toContain('DEFAULT ADMIN PASSWORD');
    });

    it('stays silent when the admin password was changed', async () => {
      const { warnOnDefaultAdminPassword } = await loadService();
      state.users.push({ id: 'u-admin', username: 'admin', isAdmin: true, password: await hashOf('s3cret') });

      const warned = await warnOnDefaultAdminPassword();

      expect(warned).toBe(false);
      expect(state.warnings).toEqual([]);
    });

    it('does not throw when there is no admin user', async () => {
      const { warnOnDefaultAdminPassword } = await loadService();

      await expect(warnOnDefaultAdminPassword()).resolves.toBe(false);
    });

    it('does not throw when the stored hash is unreadable', async () => {
      const { warnOnDefaultAdminPassword } = await loadService();
      state.users.push({ id: 'u-admin', username: 'admin', isAdmin: true, password: 'not-a-hash' });

      await expect(warnOnDefaultAdminPassword()).resolves.toBe(false);
    });
  });

  describe('cleanupDemoData', () => {
    beforeEach(() => {
      state.jobs = {
        'demo-job': { id: 'demo-job', userId: 'u-demo', name: 'Demo-Job' },
        'visitor-job': { id: 'visitor-job', userId: 'u-demo', name: 'Something a visitor made' },
        'other-user-job': { id: 'other-user-job', userId: 'u-other', name: 'Not the demo user' },
      };
    });

    it('removes the demo user jobs except the demo job', async () => {
      const { cleanupDemoData } = await loadService();

      const result = await cleanupDemoData();

      expect(Object.keys(state.jobs).sort()).toEqual(['demo-job', 'other-user-job']);
      expect(result.jobsRemoved).toBe(1);
    });

    it('hard deletes the inactive listings of the demo job', async () => {
      const { cleanupDemoData } = await loadService();

      await cleanupDemoData();

      expect(state.inactiveDeletes).toEqual(['demo-job']);
    });

    it('resets the preferences a visitor changed while keeping the seeded settings', async () => {
      state.userSettings['u-demo'] = {
        theme: 'light',
        language: 'tr',
        jobs_view_mode: 'table',
        listings_view_mode: 'table',
        finance_profile: { seeded: true },
      };
      const { cleanupDemoData } = await loadService();

      await cleanupDemoData();

      expect(state.userSettings['u-demo']).toEqual({ finance_profile: { seeded: true } });
    });

    it('does nothing when demo mode is off', async () => {
      state.settings.demoMode = false;
      state.userSettings['u-demo'] = { theme: 'light' };
      const { cleanupDemoData } = await loadService();

      const result = await cleanupDemoData();

      expect(Object.keys(state.jobs)).toHaveLength(3);
      expect(state.inactiveDeletes).toEqual([]);
      expect(state.userSettings['u-demo']).toEqual({ theme: 'light' });
      expect(result.jobsRemoved).toBe(0);
    });
  });
});
