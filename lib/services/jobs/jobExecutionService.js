/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../logger.js';
import { bus } from '../events/event-bus.js';
import * as jobStorage from '../storage/jobStorage.js';
import * as userStorage from '../storage/userStorage.js';
import { getUser } from '../storage/userStorage.js';
import { duringWorkingHoursOrNotSet } from '../../utils.js';
import FredyPipelineExecutioner from '../../FredyPipelineExecutioner.js';
import * as similarityCache from '../similarity-check/similarityCache.js';
import { isRunning, markFinished, markRunning } from './run-state.js';
import { sendToUsers } from '../sse/sse-broker.js';
import { getSettings } from '../storage/settingsStorage.js';

/**
 * Initializes the job execution service.
 * - Registers event-bus listeners for `jobs:runAll`, `jobs:runOne`, and `jobs:status`.
 * - Starts the periodic scheduler (if `intervalMs` > 0) and performs an initial run respecting working hours.
 * - Forwards job status updates to affected users via Server-Sent Events (SSE).
 *
 * This function is intentionally side-effectful and exposes no external API.
 *
 * @param {Object} deps - Dependencies required to initialize the service.
 * @param {Array<Object>} deps.providers - Loaded provider modules. Each module must expose `metaInformation.id`, `config`, and `init(config, blacklist)`.
 * @param {Object} deps.settings - Global settings object (read/write). Must include `demoMode`, `interval`, and working-hours attributes used by `duringWorkingHoursOrNotSet`.
 * @param {number} deps.intervalMs - Scheduler interval in milliseconds. If not finite or <= 0, the scheduler is not started.
 * @returns {void}
 */
export function initJobExecutionService({ providers, settings, intervalMs }) {
  // Forward job status via SSE to relevant recipients
  bus.on('jobs:status', ({ jobId, running }) => {
    try {
      const recipients = resolveRecipients(jobId);
      if (recipients.length > 0) {
        sendToUsers(recipients, 'jobStatus', { jobId, running });
      }
    } catch (err) {
      logger.warn('Failed to forward job status', jobId, err);
    }
  });

  // Listen for "run all" requests (admin = all, user = own)
  bus.on('jobs:runAll', (payload) => {
    const userId = payload?.userId ?? null;
    const user = userId ? getUser(userId) : null;
    const isAdmin = !!user?.isAdmin;
    if (isAdmin) {
      logger.debug('Running all jobs manually (admin request)');
    } else if (userId) {
      logger.debug(`Running all jobs manually for user ${userId}`);
    } else {
      logger.debug('Running all jobs manually (no user provided)');
    }
    runAll(false, { userId, isAdmin });
  });

  // Listen for single job run requests
  bus.on('jobs:runOne', ({ jobId }) => {
    logger.debug(`Running single job manually: ${jobId}`);
    // fire and forget, do not block the bus
    runSingle(jobId);
  });

  // Start scheduler and initial run
  if (Number.isFinite(intervalMs) && intervalMs > 0) {
    setInterval(() => runAll(true), intervalMs);
  }
  // start once at startup, respecting working hours
  runAll(true);

  /**
   * Resolve all recipients who should receive SSE updates for a job.
   * Includes job owner, users with whom the job is shared, and all admins.
   *
   * @param {string} jobId
   * @returns {string[]} unique userIds
   */
  function resolveRecipients(jobId) {
    const job = jobStorage.getJob(jobId);
    if (!job) return [];
    const admins = (userStorage.getUsers && userStorage.getUsers(false)) || [];
    const adminIds = admins.filter((u) => u.isAdmin).map((u) => u.id);
    const shared = Array.isArray(job.shared_with_user) ? job.shared_with_user : [];
    const recipients = [job.userId, ...shared, ...adminIds].filter(Boolean);
    return Array.from(new Set(recipients));
  }

  /**
   * Execute all enabled jobs, optionally filtering by context (admin/owner) and respecting working hours.
   *
   * @param {boolean} [respectWorkingHours=true] - If true, skip execution when outside configured working hours.
   * @param {{userId?: string, isAdmin?: boolean}} [context] - Who requested the run; determines job filtering.
   * @returns {void}
   */
  function runAll(respectWorkingHours = true, context = undefined) {
    if (settings.demoMode) return;
    const now = Date.now();
    const withinHours = duringWorkingHoursOrNotSet(settings, now);
    if (respectWorkingHours && !withinHours) {
      logger.debug('Working hours set. Skipping as outside of working hours.');
      return;
    }
    settings.lastRun = now;
    jobStorage
      .getJobs()
      .filter((job) => job.enabled)
      .filter((job) => {
        if (!context) return true; // startup/cron → all
        if (context.isAdmin) return true; // admin → all
        return context.userId ? job.userId === context.userId : false; // user → own
      })
      .forEach((job) => executeJob(job));
  }

  /**
   * Execute a single job by id.
   * Manual runs are allowed even if the job is disabled, but never duplicated when already running.
   *
   * @param {string} jobId
   * @returns {Promise<void>}
   */
  async function runSingle(jobId) {
    if (settings.demoMode) return;
    const job = jobStorage.getJob(jobId);
    if (!job) return;
    // allow manual run even if disabled; keep guard to avoid duplicates
    await executeJob(job);
  }

  /**
   * Executes one job across all of its configured providers.
   * Emits SSE start/finish events via the bus and ensures the run-state guard is always cleared.
   * Provider errors are surfaced via logging but do not abort other providers.
   *
   * @param {Object} job
   * @param {string} job.id
   * @param {Array<{id:string}>} job.provider
   * @param {Array<string>} [job.blacklist]
   * @param {*} job.notificationAdapter
   * @returns {Promise<void>}
   */
  async function executeJob(job) {
    if (isRunning(job.id)) {
      logger.debug(`Job ${job.id} is already running. Skipping.`);
      return;
    }
    const acquired = markRunning(job.id);
    if (!acquired) return;
    // notify listeners (SSE) that the job started
    try {
      bus.emit('jobs:status', { jobId: job.id, running: true });
    } catch (err) {
      logger.warn('Failed to emit start status for job', job.id, err);
    }
    try {
      const jobProviders = job.provider.filter(
        (p) => providers.find((loaded) => loaded.metaInformation.id === p.id) != null,
      );
      const executions = jobProviders.map(async (prov) => {
        const matchedProvider = providers.find((loaded) => loaded.metaInformation.id === prov.id);
        matchedProvider.init(prov, job.blacklist);
        // Fetch fresh settings each time to pick up changes without restart
        const currentSettings = await getSettings();
        await new FredyPipelineExecutioner(
          matchedProvider.config,
          job.notificationAdapter,
          prov.id,
          job.id,
          similarityCache,
          currentSettings,
        ).execute();
      });
      const results = await Promise.allSettled(executions);
      for (const r of results) {
        if (r.status === 'rejected') {
          logger.error(r.reason);
        }
      }
    } finally {
      markFinished(job.id);
      try {
        bus.emit('jobs:status', { jobId: job.id, running: false });
      } catch (err) {
        logger.warn('Failed to emit finish status for job', job.id, err);
      }
    }
  }
}
