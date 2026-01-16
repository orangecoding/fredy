/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fetch from 'node-fetch';
import { randomBetween, sleep } from '../../utils.js';

const maxAttempts = 3;

/**
 * Check if a listing is still active with up to 3 attempts and exponential backoff.
 * Backoff waits are capped and the last wait is at most 2000 ms.
 *
 * Rules:
 * - HTTP 200 => return 1
 * - HTTP 401/403 => return -1 (most certainly detected as a bot)
 * - HTTP 404 => return 0
 * - Other statuses or network errors => retry until attempts are exhausted
 *
 * @returns {Promise<Integer>} 1 if active, o if not active and -1 if detected as bot
 */
export default async function checkIfListingIsActive(link) {
  await sleep(randomBetween(50, 100));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(link, {
        redirect: 'manual',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
          'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        },
      });

      if (res.status === 200) {
        return 1;
      }
      if (res.status === 401) return -1;
      if (res.status === 403) return -1;
      if (res.status === 404) return 0;

      // For any other status, only retry if attempts remain
      if (attempt < maxAttempts) {
        await sleep(backoffDelay(attempt));
        continue;
      }

      return 0;
    } catch {
      // Network error: retry if attempts remain
      if (attempt < maxAttempts) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      return 0;
    }
  }

  return 0;
}

/**
 * Exponential backoff delay with cap.
 * attempt: 1 -> 500ms, 2 -> 1000ms, 3 -> 2000ms (cap)
 * @param {number} attempt 1-based attempt index
 * @returns {number} delay in ms
 */
function backoffDelay(attempt) {
  const base = 500;
  const cap = 2000;
  return Math.min(base * 2 ** (attempt - 1), cap);
}
