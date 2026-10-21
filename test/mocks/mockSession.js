/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

let issued = 0;

/**
 * Hang a stand-in for a @fastify/session session on a hand-built request.
 *
 * `regenerate` behaves like the plugin's: it swaps `request.session` for an empty session under a
 * new id, so code that kept a reference to the old object would be caught writing to the wrong one.
 *
 * @template {Object} T
 * @param {T} request
 * @param {Object} [data] Fields the session starts with.
 * @returns {T} The same request.
 */
export function withSession(request, data = {}) {
  const make = (fields) => ({
    ...fields,
    sessionId: `sid-${++issued}`,
    async regenerate() {
      request.session = make({});
    },
  });
  request.session = make(data);
  return request;
}
