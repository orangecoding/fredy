/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';
import SqliteConnection from './SqliteConnection.js';
import logger from '../logger.js';
import { toJson, fromJson } from '../../utils.js';

/**
 * Insert or update a job. Preserves original owner (userId) when updating an existing job.
 *
 * @param {Object} params
 * @param {string} [params.jobId] - Existing job id to update; omit to insert a new job.
 * @param {string} [params.name] - Job display name.
 * @param {Array<any>} [params.blacklist] - Blacklist entries; defaults to empty array.
 * @param {boolean} [params.enabled] - Whether the job is enabled; defaults to true.
 * @param {Array<any>} params.provider - Provider configuration list.
 * @param {Array<any>} params.notificationAdapter - Notification adapter configuration list.
 * @param {string} params.userId - Owner user id for inserts; preserved on updates.
 * @returns {void}
 */
export const upsertJob = ({
  jobId,
  name,
  blacklist = [],
  enabled = true,
  provider,
  notificationAdapter,
  userId,
  shareWithUsers = [],
}) => {
  const id = jobId || nanoid();
  const existing = SqliteConnection.query(`SELECT id, user_id FROM jobs WHERE id = @id LIMIT 1`, { id })[0];
  const ownerId = existing ? existing.user_id : userId;
  if (existing) {
    SqliteConnection.execute(
      `UPDATE jobs
         SET enabled = @enabled,
             name = @name,
             blacklist = @blacklist,
             provider = @provider,
             notification_adapter = @notification_adapter,
             shared_with_user = @shareWithUsers
       WHERE id = @id`,
      {
        id,
        enabled: enabled ? 1 : 0,
        name: name ?? null,
        blacklist: toJson(blacklist ?? []),
        shareWithUsers: toJson(shareWithUsers ?? []),
        provider: toJson(provider ?? []),
        notification_adapter: toJson(notificationAdapter ?? []),
      },
    );
  } else {
    SqliteConnection.execute(
      `INSERT INTO jobs (id, user_id, enabled, name, blacklist, provider, notification_adapter, shared_with_user)
       VALUES (@id, @user_id, @enabled, @name, @blacklist, @provider, @notification_adapter, @shareWithUsers)`,
      {
        id,
        user_id: ownerId,
        enabled: enabled ? 1 : 0,
        name: name ?? null,
        blacklist: toJson(blacklist ?? []),
        provider: toJson(provider ?? []),
        shareWithUsers: toJson(shareWithUsers ?? []),
        notification_adapter: toJson(notificationAdapter ?? []),
      },
    );
  }
};

/**
 * Get a single job by id.
 * @param {string} jobId - Job primary key.
 * @returns {Job|null} The job or null if not found.
 */
export const getJob = (jobId) => {
  const row = SqliteConnection.query(
    `SELECT j.id,
            j.user_id AS userId,
            j.enabled,
            j.name,
            j.blacklist,
            j.provider,
            j.notification_adapter AS notificationAdapter,
            (SELECT COUNT(1) FROM listings l WHERE l.job_id = j.id) AS numberOfFoundListings
       FROM jobs j
      WHERE j.id = @id
      LIMIT 1`,
    { id: jobId },
  )[0];
  if (!row) return null;
  return {
    ...row,
    enabled: !!row.enabled,
    blacklist: fromJson(row.blacklist, []),
    provider: fromJson(row.provider, []),
    notificationAdapter: fromJson(row.notificationAdapter, []),
  };
};

/**
 * Update job enabled status.
 * @param {{jobId: string, status: boolean}} params - Parameters.
 * @returns {void}
 */
export const setJobStatus = ({ jobId, status }) => {
  SqliteConnection.execute(`UPDATE jobs SET enabled = @enabled WHERE id = @id`, {
    id: jobId,
    enabled: status ? 1 : 0,
  });
};

/**
 * Remove a job by id. Listings are deleted automatically due to FK ON DELETE CASCADE.
 * @param {string} jobId - Job id.
 * @returns {void}
 */
export const removeJob = (jobId) => {
  // listings table has FK ON DELETE CASCADE via job_id
  SqliteConnection.execute(`DELETE FROM jobs WHERE id = @id`, { id: jobId });
};

export const removeJobsByUserId = (userId) => {
  // Count jobs to log similar to previous behavior
  const count =
    SqliteConnection.query(`SELECT COUNT(1) AS c FROM jobs WHERE user_id = @user_id`, { user_id: userId })[0]?.c ?? 0;
  SqliteConnection.execute(`DELETE FROM jobs WHERE user_id = @user_id`, { user_id: userId });
  if (count > 0) {
    logger.info(`Removed ${count} jobs for user ${userId}`);
  }
};

/**
 * Get all jobs.
 * @returns {Job[]} List of jobs ordered by name (NULLs last).
 */
export const getJobs = () => {
  const rows = SqliteConnection.query(
    `SELECT j.id,
            j.user_id AS userId,
            j.enabled,
            j.name,
            j.blacklist,
            j.provider,
            j.shared_with_user,
            j.notification_adapter AS notificationAdapter,
            (SELECT COUNT(1) FROM listings l WHERE l.job_id = j.id) AS numberOfFoundListings
       FROM jobs j
       ORDER BY j.name IS NULL, j.name`,
  );
  return rows.map((row) => ({
    ...row,
    enabled: !!row.enabled,
    blacklist: fromJson(row.blacklist, []),
    provider: fromJson(row.provider, []),
    shared_with_user: fromJson(row.shared_with_user, []),
    notificationAdapter: fromJson(row.notificationAdapter, []),
  }));
};
