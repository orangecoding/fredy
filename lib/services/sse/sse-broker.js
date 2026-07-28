/*
 * Copyright (c) 2026 by Christian Kellner.
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
  if (isDead(res)) return false;
  try {
    if (event) {
      res.write(`event: ${event}\n`);
    }
    if (data !== undefined) {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      res.write(`data: ${payload}\n`);
    }
    res.write('\n');
    return true;
  } catch {
    // A failed write means the peer is gone in a way that produced no 'close' event.
    return false;
  }
}

/**
 * Whether a response can no longer be written to.
 *
 * @param {import('http').ServerResponse} res
 * @returns {boolean}
 */
function isDead(res) {
  return res == null || res.writableEnded === true || res.destroyed === true;
}

/**
 * Drop a response from every user's set.
 *
 * Used when a write fails: the connection is gone but no 'close' handler ran, so nothing else
 * would ever remove it. Without this, such entries accumulate forever and the heartbeat keeps
 * writing to them every 25 seconds - which behind a proxy that drops connections silently is the
 * normal case, not an edge one.
 *
 * @param {import('http').ServerResponse} res
 * @returns {void}
 */
function forget(res) {
  for (const [userId, set] of clients) {
    if (set.delete(res) && set.size === 0) {
      clients.delete(userId);
    }
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
  // Snapshot first: writeEvent may prune the set it is iterating.
  for (const res of [...set]) {
    if (!writeEvent(res, event, data)) {
      forget(res);
    }
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

/**
 * Heartbeat that keeps connections alive through proxies, and doubles as the reaper: a client that
 * went away without a 'close' event fails its ping and is dropped here.
 *
 * @returns {number} How many dead connections were pruned.
 */
export function heartbeat() {
  let pruned = 0;
  for (const [userId, set] of clients) {
    for (const res of [...set]) {
      let alive = !isDead(res);
      if (alive) {
        try {
          res.write(`: ping ${Date.now()}\n\n`);
        } catch {
          alive = false;
        }
      }
      if (!alive) {
        set.delete(res);
        pruned++;
      }
    }
    if (set.size === 0) clients.delete(userId);
  }
  return pruned;
}

/** @type {number} */
export const HEARTBEAT_INTERVAL_MS = 25_000;

const heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
// Never a reason to hold the process open; tests and CLI runs must still be able to exit.
heartbeatTimer.unref?.();

/**
 * How many connections are currently registered. Exposed for tests and diagnostics.
 *
 * @returns {number}
 */
export function connectionCount() {
  let total = 0;
  for (const set of clients.values()) total += set.size;
  return total;
}
