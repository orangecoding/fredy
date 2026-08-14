/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * SQL predicate granting access to a job owned by or currently shared with a user.
 *
 * @param {string} alias - Trusted SQL alias supplied by the calling storage module.
 * @returns {string}
 */
export const jobAccessSql = (alias) => `(${alias}.user_id = @userId OR EXISTS (
  SELECT 1
  FROM json_each(${alias}.shared_with_user) AS scoped_user
  WHERE scoped_user.value = @userId
))`;

export const USER_LISTING_SET_SCOPE_SQL = `l.job_id IN (
  SELECT scoped_job.id
  FROM jobs scoped_job
  WHERE ${jobAccessSql('scoped_job')}
)`;

export const USER_LISTING_POINT_SCOPE_SQL = `EXISTS (
  SELECT 1
  FROM jobs scoped_job
  WHERE scoped_job.id = l.job_id
    AND ${jobAccessSql('scoped_job')}
)`;
