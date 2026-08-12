/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Who may act on what.
 *
 * The same rule - owner, or someone the job was shared with, or an admin - used to be written out
 * separately in the job router, the listings router, the MCP layer and twice in SQL. Four
 * implementations of one rule is four chances to forget it, and the routes that did forget it were
 * how any authenticated user could hard-delete somebody else's listings. New code should reach for
 * these helpers rather than re-deriving the check.
 *
 * The SQL predicates in `listingsStorage`/`jobStorage` express the same rule set-wise, for queries
 * that filter rather than decide. {@link SHARED_WITH_USER_SQL} is that predicate, so at least the
 * wording lives in one place.
 */

/**
 * SQL fragment matching jobs a user owns or that were shared with them.
 *
 * Expects the jobs table aliased as `j` and a bound `@userId` parameter.
 * @type {string}
 */
export const SHARED_WITH_USER_SQL =
  '(j.user_id = @userId OR EXISTS (SELECT 1 FROM json_each(j.shared_with_user) AS sw WHERE sw.value = @userId))';

/**
 * Whether a user may see a job.
 *
 * Read access: the owner, anyone the job is shared with, and admins.
 *
 * @param {{id: string, isAdmin?: boolean}|null|undefined} user
 * @param {{userId?: string, shared_with_user?: string[]}|null|undefined} job
 * @returns {boolean}
 */
export function canAccessJob(user, job) {
  if (user == null || job == null) return false;
  if (user.isAdmin === true) return true;
  // Both ids are optional in this signature, and `undefined === undefined` is true: without this
  // guard a user object with no id would come out as the owner of a job with no owner. Neither
  // shape reaches here today - `getUser` always returns an id and `jobs.user_id` is NOT NULL - but
  // the predicate is public and callers pass partial objects.
  if (user.id == null) return false;
  if (job.userId === user.id) return true;
  return Array.isArray(job.shared_with_user) && job.shared_with_user.includes(user.id);
}

/**
 * Whether a user may change or delete a job itself.
 *
 * Narrower than {@link canAccessJob} on purpose: being able to see a shared job does not make it
 * yours to rename, reconfigure or delete. Only the owner and admins may do that.
 *
 * @param {{id: string, isAdmin?: boolean}|null|undefined} user
 * @param {{userId?: string}|null|undefined} job
 * @returns {boolean}
 */
export function canModifyJob(user, job) {
  if (user == null || job == null) return false;
  return user.isAdmin === true || (user.id != null && job.userId === user.id);
}
