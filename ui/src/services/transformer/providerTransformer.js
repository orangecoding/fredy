/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Convert provider form data into the shape persisted with a job.
 *
 * `scanIntervalMinutes` is optional. A value of 0 means that the provider follows
 * the global job scheduler interval. Positive values act as a minimum interval:
 * scheduled job executions that occur before the provider is due simply skip it.
 *
 * @param {Object} provider
 * @returns {Object}
 */
export function transform({ name, id, enabled, url, scanIntervalMinutes = 0 }) {
  const interval = Number(scanIntervalMinutes);

  return {
    name,
    id,
    enabled,
    url,
    scanIntervalMinutes: Number.isFinite(interval) && interval > 0 ? Math.floor(interval) : 0,
  };
}
