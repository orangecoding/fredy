/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

describe('services/jobs/jobExecutionService', () => {
  /** @type {EventEmitter} */
  let bus;
  let calls;
  let state;

  async function initService() {
    const root = (await import('node:path')).resolve('.');
    const svcPath = root + '/lib/services/jobs/jobExecutionService.js';
    const busPath = root + '/lib/services/events/event-bus.js';
    const jobStoragePath = root + '/lib/services/storage/jobStorage.js';
    const userStoragePath = root + '/lib/services/storage/userStorage.js';
    const brokerPath = root + '/lib/services/sse/sse-broker.js';
    const utilsPath = root + '/lib/utils.js';
    const loggerPath = root + '/lib/services/logger.js';
    const notifyPath = root + '/lib/notification/notify.js';

    vi.resetModules();
    vi.doMock(busPath, () => ({ bus }));
    vi.doMock(jobStoragePath, () => ({
      getJob: (id) => state.jobsById[id] || null,
      getJobs: () => state.jobsList.slice(),
    }));
    vi.doMock(userStoragePath, () => ({
      getUsers: () => state.users.slice(),
      getUser: (id) => state.users.find((u) => u.id === id) || null,
    }));
    vi.doMock(brokerPath, () => ({
      sendToUsers: (...args) => calls.sent.push(args),
    }));
    vi.doMock(utilsPath, () => ({
      duringWorkingHoursOrNotSet: () => false,
    }));
    vi.doMock(loggerPath, () => {
      const m = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
      return { default: m };
    });
    vi.doMock(notifyPath, () => ({ send: async () => [] }));
    vi.doMock(root + '/lib/services/jobs/run-state.js', () => ({
      isRunning: () => false,
      markRunning: (id) => {
        calls.markRunning.push(id);
        return true;
      },
      markFinished: () => {},
    }));

    const mod = await import(svcPath);
    mod.initJobExecutionService({ providers: [], settings: { demoMode: false }, intervalMs: 0 });
    return mod;
  }

  beforeEach(() => {
    bus = new EventEmitter();
    calls = { sent: [], markRunning: [] };
    state = {
      jobsById: {},
      jobsList: [],
      users: [],
    };
  });

  it('forwards SSE jobStatus to owner, shared users and admins', async () => {
    state.jobsById['j1'] = { id: 'j1', userId: 'owner1', shared_with_user: ['u2'] };
    state.users = [
      { id: 'a1', isAdmin: true },
      { id: 'owner1', isAdmin: false },
      { id: 'u2', isAdmin: false },
    ];

    await initService();

    bus.emit('jobs:status', { jobId: 'j1', running: true });

    expect(calls.sent.length, 'sendToUsers should be called once').toBe(1);
    const [recipients, event, data] = calls.sent[0];
    expect(event).toBe('jobStatus');
    expect(data).toEqual({ jobId: 'j1', running: true });
    const got = new Set(recipients);
    const expected = new Set(['owner1', 'u2', 'a1']);
    expect(got).toEqual(expected);
  });

  it('runs all jobs for admin; only own jobs for regular user', async () => {
    state.jobsList = [
      { id: 'j1', enabled: true, userId: 'u1', provider: [] },
      { id: 'j2', enabled: true, userId: 'u2', provider: [] },
    ];
    state.users = [
      { id: 'u1', isAdmin: false },
      { id: 'u2', isAdmin: false },
      { id: 'admin', isAdmin: true },
    ];

    await initService();

    // Non-admin: only own jobs
    bus.emit('jobs:runAll', { userId: 'u1' });
    // allow microtasks to flush
    await new Promise((r) => setTimeout(r, 0));
    expect(new Set(calls.markRunning)).toEqual(new Set(['j1']));

    // Admin: all jobs
    calls.markRunning = [];
    bus.emit('jobs:runAll', { userId: 'admin' });
    await new Promise((r) => setTimeout(r, 0));
    expect(new Set(calls.markRunning)).toEqual(new Set(['j1', 'j2']));
  });
});
