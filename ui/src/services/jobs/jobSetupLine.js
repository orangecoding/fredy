/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Provider ids, as jobs and listings store them, mapped to the names the portals go by.
 *
 * @param {Array<{id: string, name: string}>|null|undefined} providers The provider list from the store.
 * @returns {Record<string, string>}
 */
export function providerNameMap(providers) {
  return Object.fromEntries((Array.isArray(providers) ? providers : []).map((p) => [p.id, p.name]));
}

/**
 * What one job searches and where it reports, as one line: the portals' names, then its channels.
 *
 * Printed under a job's name on the overview and on the job cards alike, and kept here so the two
 * cannot drift. "3 providers, 1 channel" made the reader open the job to learn which; the names say
 * it in the same space.
 *
 * @param {Object} job
 * @param {Record<string, string>} [providerNames] From `providerNameMap`.
 * @returns {string}
 */
export function jobSetupLine(job, providerNames = {}) {
  const portals = (job?.provider ?? []).map((p) => providerNames[p?.id] ?? p?.name ?? p?.id).filter(Boolean);
  const channels = (job?.notificationAdapter ?? []).map((a) => a?.name).filter(Boolean);
  return [portals.join(', '), channels.join(', ')].filter((part) => part.length > 0).join(' · ');
}
