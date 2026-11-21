/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * How a shared service says no.
 *
 * The services under `lib/services` that both the HTTP routes and the MCP tools call answer a
 * refusal with one shape, so each caller only decides how to put it: a route turns the `reason`
 * into a status code, an MCP tool turns `error` (and, where it helps a model, `code`) into its
 * answer. The rule that refused is written once, in the service.
 *
 * @typedef {'invalid'|'forbidden'|'notFound'|'conflict'|'unavailable'|'failed'} FailureReason
 *
 * @typedef {Object} ServiceFailure
 * @property {false} ok
 * @property {FailureReason} reason - What kind of refusal, independent of the transport.
 * @property {string} error - A sentence a person can read.
 * @property {string} [code] - Which rule refused, for a caller that wants to add its own hint.
 */

/** @type {Record<FailureReason, number>} */
const HTTP_STATUS = Object.freeze({
  invalid: 400,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  failed: 500,
  unavailable: 503,
});

/**
 * Build a refusal.
 *
 * @param {FailureReason} reason
 * @param {string} error
 * @param {Record<string, unknown>} [extra] - Anything a caller may pass on, e.g. `code` or the jobs
 *   that block a delete.
 * @returns {ServiceFailure & Record<string, unknown>}
 */
export function fail(reason, error, extra = {}) {
  return { ...extra, ok: false, reason, error };
}

/**
 * The HTTP status code for a refusal.
 *
 * @param {ServiceFailure} failure
 * @returns {number}
 */
export function httpStatusOf(failure) {
  return HTTP_STATUS[failure?.reason] ?? 500;
}
