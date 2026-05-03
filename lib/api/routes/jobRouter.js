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

const DEMO_JOB_NAME = 'Demo-Job';

function doesJobBelongsToUser(job, request) {
  const userId = request.session.currentUser;
  if (userId == null) return false;
  const user = userStorage.getUser(userId);
  if (user == null) return false;
  return user.isAdmin || job.userId === user.id;
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function jobPlugin(fastify) {
  fastify.get('/', async (request) => {
    const isUserAdmin = isAdmin(request);
    return jobStorage
      .getJobs()
      .filter(
        (job) =>
          isUserAdmin ||
          job.userId === request.session.currentUser ||
          job.shared_with_user.includes(request.session.currentUser),
      )
      .map((job) => ({
        ...job,
        running: isJobRunning(job.id),
        isOnlyShared:
          !isUserAdmin &&
          job.userId !== request.session.currentUser &&
          job.shared_with_user.includes(request.session.currentUser),
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

    const isUserAdmin = isAdmin(request);
    queryResult.result = queryResult.result.map((job) => ({
      ...job,
      running: isJobRunning(job.id),
      isOnlyShared:
        !isUserAdmin &&
        job.userId !== request.session.currentUser &&
        job.shared_with_user.includes(request.session.currentUser),
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
      request.raw.on('close', onClose);
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
    } = request.body;
    const settings = await getSettings();
    try {
      const jobFromDb = jobStorage.getJob(jobId);

      if (jobFromDb && !doesJobBelongsToUser(jobFromDb, request)) {
        return reply.code(403).send({ error: 'You are trying to change a job that is not associated to your user.' });
      }

      if (settings.demoMode && !isAdmin(request) && jobFromDb && jobFromDb.name === DEMO_JOB_NAME) {
        return reply.code(403).send({ error: 'Sorry, but you cannot change the Status of our Demo Job ;)' });
      }

      jobStorage.upsertJob({
        userId: request.session.currentUser,
        jobId,
        enabled,
        name,
        blacklist,
        provider,
        notificationAdapter,
        shareWithUsers,
        spatialFilter,
        specFilter,
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
      if (settings.demoMode && !isAdmin(request) && job.name === DEMO_JOB_NAME) {
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

      if (settings.demoMode && !isAdmin(request) && job.name === DEMO_JOB_NAME) {
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
    const users = userStorage.getUsers(false);
    return users
      .filter((user) => !user.isAdmin && user.id !== currentUser)
      .map((user) => ({
        id: user.id,
        name: user.username,
      }));
  });
}
