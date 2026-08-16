/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

let tmpStore = {};

export const send = (serviceName, payload) => {
  tmpStore = { serviceName, payload };
  return [Promise.resolve()];
};

export const get = () => {
  return tmpStore;
};

/**
 * Forget the last notification.
 *
 * Needed by any test asserting that nothing was sent: without it the previous test's payload is
 * still here, and "no notification" reads exactly like "the one from before".
 */
export const reset = () => {
  tmpStore = {};
};
