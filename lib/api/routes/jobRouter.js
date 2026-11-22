/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as jobStorage from '../../services/storage/jobStorage.js';
import * as userStorage from '../../services/storage/userStorage.js';
import { isAdmin } from '../security.js';
import logger from '../../services/logger.js';
import { isRunning as isJobRunning } from '../../services/jobs/run-state.js';
import { addClient as addSseClient, removeClient } from '../../services/sse/sse-broker.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import { isDemoJob } from '../../services/demo/demoService.js';
import { canAccessJob, canModifyJob } from '../../services/security/access.js';
import { deleteJob, saveJob, setJobEnabled, startAllJobRuns, startJobRun } from '../../services/jobs/jobService.js';
import { sendFailure } from '../../services/serviceResult.js';

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
 * @param {import('fastify').FastifyInstance} fastify
 */
/**
 * A job as the browser may see it: its channels by name and reference, without their fields.
 *
 * The storage hydrates every channel with its full configuration, which the pipeline needs to send
 * anything. Passed on as it was, the job list handed a bot token or an SMTP password to every user
 * who may merely use a channel, or who has a job shared with them, while the channel route itself
 * redacts those fields. The UI only ever reads the name and the reference here.
 *
 * @param {Object} job
 * @returns {Object}
 */
export function toClientJob(job) {
  return {
    ...job,
    notificationAdapter: (job.notificationAdapter ?? []).map(({ id, name, configuredAdapterId }) => ({
      id,
      name,
      configuredAdapterId,
    })),
  };
}

export default async function jobPlugin(fastify) {
  fastify.get('/', async (request) => {
    return jobStorage
      .getJobs({ includeDisabled: true, visibleTo: request.currentUser })
      .filter((job) => canAccessJob(request.currentUser, job))
      .map((job) => ({
        ...toClientJob(job),
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
      ...toClientJob(job),
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
      const started = startAllJobRuns(request.currentUser);
      if (!started.ok) return sendFailure(reply, started, 'message');
      return reply.code(202).send({ message: 'Run all accepted' });
    } catch (err) {
      logger.error('Failed to trigger startAll', err);
      return reply.code(500).send({ message: 'Unexpected error' });
    }
  });

  fastify.post('/:jobId/run', async (request, reply) => {
    try {
      const started = startJobRun(request.currentUser, request.params.jobId);
      if (!started.ok) return sendFailure(reply, started, 'message');
      return reply.code(202).send({ message: 'Job run accepted' });
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Unexpected error triggering job' });
    }
  });

  // Every rule a save is held to lives in `jobService.saveJob`, which the MCP job tools save
  // through too.
  fastify.post('/', async (request, reply) => {
    try {
      const saved = await saveJob(request.currentUser, request.body ?? {});
      if (!saved.ok) return sendFailure(reply, saved);
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });

  fastify.delete('/', async (request, reply) => {
    try {
      const deleted = await deleteJob(request.currentUser, request.body?.jobId);
      if (!deleted.ok) return sendFailure(reply, deleted);
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });

  fastify.put('/:jobId/status', async (request, reply) => {
    try {
      const switched = await setJobEnabled(request.currentUser, request.params.jobId, request.body?.status);
      if (!switched.ok) return sendFailure(reply, switched);
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });

  fastify.post('/:jobId/blacklist', async (request, reply) => {
    const { jobId } = request.params;
    const { word, words } = request.body || {};

    const candidateWords = [];
    if (typeof word === 'string') candidateWords.push(word);
    if (Array.isArray(words)) candidateWords.push(...words);

    const cleanedWords = candidateWords
      .filter((w) => typeof w === 'string')
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    if (cleanedWords.length === 0) {
      return reply.code(400).send({ error: 'No valid blacklist word provided' });
    }

    try {
      const job = jobStorage.getJob(jobId);
      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }

      const settings = await getSettings();
      if (settings.demoMode && !isAdmin(request) && isDemoJob(job.id)) {
        return reply.code(403).send({ error: 'Sorry, but you cannot modify the Demo Job ;)' });
      }

      if (!doesJobBelongsToUser(job, request)) {
        return reply.code(403).send({ error: 'You are trying to change a job that is not associated to your user' });
      }

      const result = jobStorage.appendJobBlacklist(jobId, cleanedWords);
      return reply.send({
        success: true,
        blacklist: result.blacklist,
        added: result.added,
      });
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
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
