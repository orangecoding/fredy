/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as jobStorage from '../../services/storage/jobStorage.js';
import * as userStorage from '../../services/storage/userStorage.js';
import { isAdmin } from '../security.js';
import logger from '../../services/logger.js';
import { bus } from '../../services/events/event-bus.js';
import { isRunning as isJobRunning } from '../../services/jobs/run-state.js';
import { addClient as addSseClient, removeClient } from '../../services/sse/sse-broker.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import { DEAL_TYPES, detectDealTypeForJob, normalizeDealType } from '../../services/dealType.js';
import { isDemoJob } from '../../services/demo/demoService.js';
import { canUseChannel } from '../../services/security/channelAccess.js';
import * as channelStorage from '../../services/storage/configuredAdapterStorage.js';
import { canAccessJob, canModifyJob } from '../../services/security/access.js';
import { normalizeCommuteFilter } from '../../utils/commuteBudget.js';

/**
 * Whether the request may change this job. `request.currentUser` is resolved once by authHook.
 *
 * @param {Object} job
 * @param {import('fastify').FastifyRequest} request
 * @returns {boolean}
 */
function doesJobBelongsToUser(job, request) {
  return canModifyJob(request.currentUser, job);
}

/**
 * Pin whatever the client sent down to a de-duplicated list of channel ids.
 *
 * Accepting both `['id']` and `[{ configuredAdapterId }]` costs three lines and means the UI, the
 * MCP layer and anyone scripting against the API can all send the shape that is natural to them.
 * The legacy inline shape (`{ id, fields }`) is deliberately dropped rather than migrated on the
 * fly: silently creating a channel from an API call would hide credentials in a place the caller
 * never asked for.
 *
 * @param {any} input
 * @returns {string[]}
 */
export function toChannelRefs(input) {
  if (!Array.isArray(input)) return [];
  const ids = input
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry != null && typeof entry === 'object') return entry.configuredAdapterId;
      return null;
    })
    .filter((id) => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)];
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function jobPlugin(fastify) {
  fastify.get('/', async (request) => {
    return jobStorage
      .getJobs({ includeDisabled: true })
      .filter((job) => canAccessJob(request.currentUser, job))
      .map((job) => ({
        ...job,
        running: isJobRunning(job.id),
        // Visible but not editable: shared with this user rather than owned by them.
        isOnlyShared: canAccessJob(request.currentUser, job) && !canModifyJob(request.currentUser, job),
      }));
  });

  fastify.get('/data', async (request) => {
    const {
      page,
      pageSize = 50,
      activityFilter,
      sortfield = null,
      sortdir = 'asc',
      freeTextFilter,
    } = request.query || {};

    const toBool = (v) => {
      if (v === true || v === 'true' || v === 1 || v === '1') return true;
      if (v === false || v === 'false' || v === 0 || v === '0') return false;
      return null;
    };
    const normalizedActivity = toBool(activityFilter);

    const queryResult = jobStorage.queryJobs({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 50,
      freeTextFilter: freeTextFilter || null,
      activityFilter: normalizedActivity,
      sortField: sortfield || null,
      sortDir: sortdir === 'desc' ? 'desc' : 'asc',
      userId: request.session.currentUser,
      isAdmin: isAdmin(request),
    });

    queryResult.result = queryResult.result.map((job) => ({
      ...job,
      running: isJobRunning(job.id),
      isOnlyShared: canAccessJob(request.currentUser, job) && !canModifyJob(request.currentUser, job),
    }));

    return queryResult;
  });

  // Server-Sent Events for real-time job status updates
  fastify.get('/events', async (request, reply) => {
    const userId = request.session?.currentUser;
    if (userId == null) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    reply.hijack();
    const raw = reply.raw;
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache');
    raw.setHeader('Connection', 'keep-alive');

    try {
      raw.write(': connected\n\n');
      addSseClient(userId, raw);
      const onClose = () => removeClient(userId, raw);
      // 'close' alone misses a connection that errors or is aborted, which leaves the response in
      // the broker's map forever. The heartbeat prunes those too, but only after up to 25s.
      request.raw.on('close', onClose);
      request.raw.on('aborted', onClose);
      request.raw.on('error', onClose);
      raw.on('error', onClose);
    } catch (e) {
      logger.error('Error establishing SSE connection', e);
      try {
        raw.end();
      } catch {
        /* noop */
      }
    }
  });

  fastify.post('/startAll', async (request, reply) => {
    try {
      const userId = request.session.currentUser;
      bus.emit('jobs:runAll', { userId });
      return reply.code(202).send({ message: 'Run all accepted' });
    } catch (err) {
      logger.error('Failed to trigger startAll', err);
      return reply.code(500).send({ message: 'Unexpected error' });
    }
  });

  fastify.post('/:jobId/run', async (request, reply) => {
    const { jobId } = request.params;
    try {
      const job = jobStorage.getJob(jobId);
      if (!job) {
        return reply.code(404).send({ message: 'Job not found' });
      }
      if (!doesJobBelongsToUser(job, request)) {
        return reply.code(403).send({ message: 'You are trying to run a job that is not associated to your user' });
      }
      if (isJobRunning(jobId)) {
        return reply.code(409).send({ message: 'Job is already running' });
      }
      bus.emit('jobs:runOne', { jobId });
      return reply.code(202).send({ message: 'Job run accepted' });
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Unexpected error triggering job' });
    }
  });

  fastify.post('/', async (request, reply) => {
    const {
      provider,
      notificationAdapter,
      name,
      blacklist = [],
      jobId,
      enabled,
      shareWithUsers = [],
      spatialFilter = null,
      specFilter = null,
      commuteFilter = null,
      dealType = null,
    } = request.body;
    const settings = await getSettings();
    try {
      const jobFromDb = jobStorage.getJob(jobId);

      if (jobFromDb && !doesJobBelongsToUser(jobFromDb, request)) {
        return reply.code(403).send({ error: 'You are trying to change a job that is not associated to your user.' });
      }

      if (settings.demoMode && !isAdmin(request) && jobFromDb && isDemoJob(jobFromDb.id)) {
        return reply.code(403).send({ error: 'Sorry, but you cannot change the Status of our Demo Job ;)' });
      }

      // Jobs now reference channels rather than carrying their configuration. Without this check
      // any authenticated user could attach an admin-only channel by putting its id in the body.
      const channelRefs = toChannelRefs(notificationAdapter);
      for (const channelId of channelRefs) {
        const channel = channelStorage.getChannel(channelId);
        if (channel == null) {
          return reply.code(400).send({ error: `Unknown notification channel: ${channelId}` });
        }
        // `request.currentUser`, not `request.session.currentUser`: the predicate needs the
        // resolved user object. Handed the bare id string it would read `undefined` for both
        // `isAdmin` and `id` and reject every request.
        if (!canUseChannel(request.currentUser, channel)) {
          return reply
            .code(403)
            .send({ error: 'You are not allowed to use one of the selected notification channels.' });
        }
      }

      // The UI always sends the deal type - it is a mandatory field there. A job created over the
      // API without it is classified from its search URLs instead, and falls back to renting,
      // which is what most Fredy jobs look for.
      const resolvedDealType =
        normalizeDealType(dealType) ?? jobFromDb?.dealType ?? detectDealTypeForJob(provider) ?? DEAL_TYPES.RENT;

      jobStorage.upsertJob({
        userId: request.session.currentUser,
        jobId,
        enabled,
        name,
        blacklist,
        provider,
        notificationAdapter: channelRefs.map((configuredAdapterId) => ({ configuredAdapterId })),
        shareWithUsers,
        spatialFilter,
        specFilter,
        // Normalised here rather than trusted: this one can hold back a listing, and the shape
        // arriving over the API decides whether it holds back the right ones. A filter that would
        // do nothing normalises to null, so an emptied form clears the column instead of storing
        // an object that means the same as not having one.
        commuteFilter: normalizeCommuteFilter(commuteFilter),
        dealType: resolvedDealType,
      });
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });

  fastify.delete('/', async (request, reply) => {
    const { jobId } = request.body;
    const settings = await getSettings();
    try {
      const job = jobStorage.getJob(jobId);
      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }
      if (settings.demoMode && !isAdmin(request) && isDemoJob(job.id)) {
        return reply.code(403).send({ error: 'Sorry, but you cannot remove the Demo Job ;)' });
      }

      if (!doesJobBelongsToUser(job, request)) {
        return reply.code(403).send({ error: 'You are trying to remove a job that is not associated to your user' });
      }
      jobStorage.removeJob(jobId);
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });

  fastify.put('/:jobId/status', async (request, reply) => {
    const { status } = request.body;
    const { jobId } = request.params;
    const settings = await getSettings();
    try {
      const job = jobStorage.getJob(jobId);
      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }

      if (settings.demoMode && !isAdmin(request) && isDemoJob(job.id)) {
        return reply.code(403).send({ error: 'Sorry, but you cannot change the Status of our Demo Job ;)' });
      }

      if (!doesJobBelongsToUser(job, request)) {
        return reply.code(403).send({ error: 'You are trying change a job that is not associated to your user' });
      }
      jobStorage.setJobStatus({ jobId, status });
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });

  fastify.get('/shareableUserList', async (request) => {
    const currentUser = request.session.currentUser;
    const users = userStorage.getUsers();
    return users
      .filter((user) => !user.isAdmin && user.id !== currentUser)
      .map((user) => ({
        id: user.id,
        name: user.username,
      }));
  });
}
