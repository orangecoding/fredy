/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fetch from 'node-fetch';
import { randomBetween, sleep } from '../../utils.js';

const maxAttempts = 3;

const userAgents = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
];

/**
 * Check if a listing is still active with up to 5 attempts and exponential backoff.
 * Backoff waits are randomized and capped.
 *
 * Rules:
 * - HTTP 200 => return 1 (if checkForText is provided and found, returns 0)
 * - HTTP 401/403 => return -1 (most certainly detected as a bot)
 * - HTTP 404 => return 0
 * - Other statuses or network errors => retry until attempts are exhausted
 *
 * @returns {Promise<Integer>} 1 if active, 0 if not active and -1 if detected as bot
 */
export default async function checkIfListingIsActive(link, checkForText = null) {
  await sleep(randomBetween(50, 100));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
      const res = await fetch(link, {
        redirect: 'manual',
        headers: {
          'User-Agent': userAgent,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'max-age=0',
          'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"macOS"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          Referer: 'https://www.google.com/',
        },
      });

      if (res.status === 200) {
        if (checkForText) {
          const htmText = await res.text();
          if (htmText.includes(checkForText)) {
            return 0;
          }
        }

        return 1;
      }
      if (res.status === 401 || res.status === 403) {
        if (attempt < maxAttempts) {
          await sleep(backoffDelay(attempt));
          continue;
        }
        return -1;
      }
      if (res.status === 404 || res.status === 410) return 0;

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
 * Exponential backoff delay with cap and jitter.
 * @param {number} attempt 1-based attempt index
 * @returns {number} delay in ms
 */
function backoffDelay(attempt) {
  const base = 500;
  const cap = 2000;
  const delay = Math.min(base * 2 ** (attempt - 1), cap);
  return delay + randomBetween(0, 1000);
}
