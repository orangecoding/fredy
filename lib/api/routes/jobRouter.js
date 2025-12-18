/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import restana from 'restana';
import * as jobStorage from '../../services/storage/jobStorage.js';
import * as userStorage from '../../services/storage/userStorage.js';
import { isAdmin } from '../security.js';
import logger from '../../services/logger.js';
import { bus } from '../../services/events/event-bus.js';
import { isRunning as isJobRunning } from '../../services/jobs/run-state.js';
import { addClient as addSseClient, removeClient } from '../../services/sse/sse-broker.js';

const service = restana();
const jobRouter = service.newRouter();

function doesJobBelongsToUser(job, req) {
  const userId = req.session.currentUser;
  if (userId == null) {
    return false;
  }
  const user = userStorage.getUser(userId);
  if (user == null) {
    return false;
  }
  return user.isAdmin || job.userId === user.id;
}

jobRouter.get('/', async (req, res) => {
  const isUserAdmin = isAdmin(req);
  //show only the jobs which belongs to the user (or all of the user is an admin)
  res.body = jobStorage
    .getJobs()
    .filter(
      (job) =>
        isUserAdmin || job.userId === req.session.currentUser || job.shared_with_user.includes(req.session.currentUser),
    )
    .map((job) => {
      return {
        ...job,
        running: isJobRunning(job.id),
        isOnlyShared:
          !isUserAdmin &&
          job.userId !== req.session.currentUser &&
          job.shared_with_user.includes(req.session.currentUser),
      };
    });

  res.send();
});

// Server-Sent Events for job status updates
jobRouter.get('/events', async (req, res) => {
  const userId = req.session.currentUser;
  if (userId == null) {
    res.send({ message: 'Unauthorized' }, 401);
    return;
  }
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  try {
    // Initial comment to establish stream
    res.write(': connected\n\n');
    addSseClient(userId, res);
    // Cleanup on close/aborted
    const onClose = () => removeClient(userId, res);
    // restana exposes original req/res; use both close and finish
    req.on('close', onClose);
    req.on('aborted', onClose);
    res.on('close', onClose);
  } catch (e) {
    logger.error('Error establishing SSE connection', e);
    try {
      res.end();
    } catch {
      //noop
    }
  }
});

jobRouter.post('/startAll', async (req, res) => {
  try {
    const userId = req.session.currentUser;
    // Emit only the userId; handler will decide based on admin/ownership
    bus.emit('jobs:runAll', { userId });
    res.send({ message: 'Run all accepted' }, 202);
  } catch (err) {
    logger.error('Failed to trigger startAll', err);
    res.send({ message: 'Unexpected error' }, 500);
  }
});

// Trigger a single job run
jobRouter.post('/:jobId/run', async (req, res) => {
  const { jobId } = req.params;
  try {
    const job = jobStorage.getJob(jobId);
    if (!job) {
      res.send({ message: 'Job not found' }, 404);
      return;
    }
    if (!doesJobBelongsToUser(job, req)) {
      res.send({ message: 'You are trying to run a job that is not associated to your user' }, 403);
      return;
    }
    if (isJobRunning(jobId)) {
      res.send({ message: 'Job is already running' }, 409);
      return;
    }
    // fire and forget; actual execution handled by index.js listener
    bus.emit('jobs:runOne', { jobId });
    res.send({ message: 'Job run accepted' }, 202);
  } catch (error) {
    logger.error(error);
    res.send({ message: 'Unexpected error triggering job' }, 500);
  }
});

jobRouter.post('/', async (req, res) => {
  const { provider, notificationAdapter, name, blacklist = [], jobId, enabled, shareWithUsers = [] } = req.body;
  try {
    let jobFromDb = jobStorage.getJob(jobId);

    if (jobFromDb && !doesJobBelongsToUser(jobFromDb, req)) {
      res.send(new Error('You are trying to change a job that is not associated to your user.'));
      return;
    }

    jobStorage.upsertJob({
      userId: req.session.currentUser,
      jobId,
      enabled,
      name,
      blacklist,
      provider,
      notificationAdapter,
      shareWithUsers,
    });
  } catch (error) {
    res.send(new Error(error));
    logger.error(error);
  }
  res.send();
});

jobRouter.delete('', async (req, res) => {
  const { jobId } = req.body;
  try {
    const job = jobStorage.getJob(jobId);
    if (!doesJobBelongsToUser(job, req)) {
      res.send(new Error('You are trying to remove a job that is not associated to your user'));
    } else {
      jobStorage.removeJob(jobId);
    }
  } catch (error) {
    res.send(new Error(error));
    logger.error(error);
  }
  res.send();
});
jobRouter.put('/:jobId/status', async (req, res) => {
  const { status } = req.body;
  const { jobId } = req.params;
  try {
    const job = jobStorage.getJob(jobId);
    if (!doesJobBelongsToUser(job, req)) {
      res.send(new Error('You are trying change a job that is not associated to your user'));
    } else {
      jobStorage.setJobStatus({
        jobId,
        status,
      });
    }
  } catch (error) {
    res.send(new Error(error));
    logger.error(error);
  }
  res.send();
});

jobRouter.get('/shareableUserList', async (req, res) => {
  const currentUser = req.session.currentUser;
  const users = userStorage.getUsers(false);
  res.body = users
    .filter((user) => !user.isAdmin && user.id !== currentUser)
    .map((user) => ({
      id: user.id,
      name: user.username,
    }));
  res.send();
});
export { jobRouter };
