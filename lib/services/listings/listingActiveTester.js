/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fetch from 'node-fetch';
import { randomBetween, sleep } from '../../utils.js';
import { MAX_PROBE_ATTEMPTS, backoffDelay, retryAfterDelay } from './activeProbeBackoff.js';

const userAgents = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
];

/**
 * Check if a listing is still active with up to {@link MAX_PROBE_ATTEMPTS} attempts and exponential
 * backoff. Backoff waits are randomized and capped.
 *
 * Rules:
 * - HTTP 200 => return 1 (if checkForText is provided and found, returns 0)
 * - HTTP 404/410 => return 0, the only two answers that actually mean "this listing is gone"
 * - Anything else, including a network error => retry, then return -1
 *
 * Only the portal saying so counts as gone. A rate limit, a bot wall or a 5xx says nothing about
 * whether the flat is still listed, and reading one as "gone" deactivates a live listing on the
 * spot. `-1` instead hands the listing to the checker's failure streak, which needs
 * `ACTIVE_CHECK_FAILURE_LIMIT` refusals in a row before it gives up on it - that streak exists for
 * exactly this case, and returning 0 here used to walk straight past it.
 *
 * @param {string} link
 * @param {string | null} [checkForText] Text that marks a 200 page as a "listing not found" page.
 * @returns {Promise<number>} 1 if active, 0 if gone, -1 if the portal gave no usable answer
 */
export default async function checkIfListingIsActive(link, checkForText = null) {
  await sleep(randomBetween(50, 100));

  for (let attempt = 1; attempt <= MAX_PROBE_ATTEMPTS; attempt++) {
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
      if (res.status === 404 || res.status === 410) return 0;

      // Every other status is "no answer". A 429 is retried on the portal's own terms, because
      // guessing a delay against a rate limiter is how one rate limit becomes two.
      if (attempt < MAX_PROBE_ATTEMPTS) {
        await sleep(res.status === 429 ? retryAfterDelay(res, attempt) : backoffDelay(attempt));
        continue;
      }

      return -1;
    } catch {
      // Network error: retry if attempts remain
      if (attempt < MAX_PROBE_ATTEMPTS) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      return -1;
    }
  }

  return -1;
}
