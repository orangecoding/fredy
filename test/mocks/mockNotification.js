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
