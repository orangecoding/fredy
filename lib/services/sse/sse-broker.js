/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * In-memory SSE client registry.
 * Maps a userId to a Set of Node.js ServerResponse objects representing open streams.
 * @type {Map<string, Set<import('http').ServerResponse>>}
 */
const clients = new Map(); // Map<userId, Set<ServerResponse>>

/**
 * Write a single SSE event frame to a response.
 *
 * @param {import('http').ServerResponse} res - The open SSE HTTP response.
 * @param {string} [event] - Optional event name (sent as `event:`). If omitted, a generic message is sent.
 * @param {any} [data] - Optional payload. Objects are JSON.stringified.
 * @returns {void}
 */
function writeEvent(res, event, data) {
  try {
    if (event) {
      res.write(`event: ${event}\n`);
    }
    if (data !== undefined) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      res.write(`data: ${payload}\n`);
    }
    res.write('\n');
  } catch {
    // ignore write errors here; cleanup happens on close
  }
}

/**
 * Register a new SSE client for the given user.
 *
 * @param {string} userId
 * @param {import('http').ServerResponse} res
 * @returns {void}
 */
export function addClient(userId, res) {
  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  set.add(res);
  // send a hello event
  writeEvent(res, 'hello', { ok: true });
}

/**
 * Unregister a specific SSE client for a user. Removes the user entry when empty.
 *
 * @param {string} userId
 * @param {import('http').ServerResponse} res
 * @returns {void}
 */
export function removeClient(userId, res) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

/**
 * Send an SSE event to all open connections of a user.
 *
 * @param {string} userId
 * @param {string} event
 * @param {any} data
 * @returns {void}
 */
export function sendToUser(userId, event, data) {
  const set = clients.get(userId);
  if (!set) return;
  for (const res of set) {
    writeEvent(res, event, data);
  }
}

/**
 * Broadcast an SSE event to multiple users (unique by id).
 *
 * @param {string[]} userIds
 * @param {string} event
 * @param {any} data
 * @returns {void}
 */
export function sendToUsers(userIds, event, data) {
  const unique = Array.from(new Set(userIds));
  unique.forEach((id) => sendToUser(id, event, data));
}

// Heartbeat to keep connections alive on proxies (every 25s)
setInterval(() => {
  for (const set of clients.values()) {
    for (const res of set) {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        // ignore
      }
    }
  }
}, 25000);
