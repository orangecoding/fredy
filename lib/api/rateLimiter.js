/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Identify the caller for rate limiting.
 *
 * Uses `request.ip`, which fastify derives from `x-forwarded-for` only when the server is
 * configured with `trustProxy`. Reading the header directly let anyone reset their own counter by
 * sending a different value on every attempt, which made the limit decorative.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {string}
 */
export function getClientIp(request) {
  return request.ip || request.socket?.remoteAddress || 'unknown';
}

/**
 * A fixed-window attempt counter kept in memory.
 *
 * One instance per thing being limited (logins, client registrations). Expired windows are swept
 * on every call, which keeps the map bounded without a timer.
 *
 * @param {number} windowMs - How long a window lasts from its first attempt.
 * @param {number} [maxKeys=10000] - Most keys held at once; the oldest is dropped beyond that.
 * @returns {{hit: (key: string, max: number) => boolean, clear: (key: string) => void}}
 *   `hit` counts one attempt against a key and reports whether it is now over its ceiling;
 *   `clear` forgets a key, for when the attempt turned out to be legitimate.
 */
export function createWindowLimiter(windowMs, maxKeys = 10_000) {
  /** @type {Map<string, {count: number, firstAttempt: number}>} */
  const attempts = new Map();
  return {
    hit(key, max) {
      const now = Date.now();
      // The map keeps insertion order, so the expired windows are at the front: stop at the first
      // live one instead of walking every entry on every attempt.
      for (const [existing, record] of attempts) {
        if (now - record.firstAttempt <= windowMs) break;
        attempts.delete(existing);
      }
      // A ceiling on top of the expiry: attempts with ever new user names otherwise grew the map
      // without bound for a whole window. The oldest key goes first.
      if (!attempts.has(key) && attempts.size >= maxKeys) {
        attempts.delete(attempts.keys().next().value);
      }
      const record = attempts.get(key);
      if (!record || now - record.firstAttempt > windowMs) {
        // Deleted first so a renewed window moves to the back, keeping the front the oldest.
        attempts.delete(key);
        attempts.set(key, { count: 1, firstAttempt: now });
        return false;
      }
      record.count++;
      return record.count > max;
    },
    clear(key) {
      attempts.delete(key);
    },
  };
}
