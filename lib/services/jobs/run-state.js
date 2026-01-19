/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Simple in-memory running state registry for jobs.
 * Prevents concurrent execution of the same job within a single process.
 * This registry is reset on process restart.
 * @type {Set<string>}
 */
const running = new Set();

/**
 * Check if a job is currently marked as running.
 * @param {string} jobId
 * @returns {boolean}
 */
export function isRunning(jobId) {
  return running.has(jobId);
}

/**
 * Try to mark a job as running.
 * If it was already running, returns false and does not modify the set.
 * @param {string} jobId
 * @returns {boolean} true if the job was successfully marked as running
 */
export function markRunning(jobId) {
  if (running.has(jobId)) return false;
  running.add(jobId);
  return true;
}

/**
 * Mark a job as finished (remove from the running registry).
 * @param {string} jobId
 * @returns {void}
 */
export function markFinished(jobId) {
  running.delete(jobId);
}
