/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The external scrape service that clears a bot wall.
 *
 * A portal behind DataDome answers a plain request with an interstitial, and answers a headless
 * browser calling from a datacenter address with the same. `FREDY_CHALLENGE_SOLVER_URL` names a
 * service that renders the page anyway and hands back what it earned: the page, the cookies, and
 * the user agent those were minted with.
 */

import logger from '../logger.js';

/** How long the solver is given to clear a wall. It renders a page and may escalate tiers. */
export const SOLVER_TIMEOUT_MS = 90_000;

/**
 * @returns {string|null} the configured solver, or null when there is none
 */
export function challengeSolverUrl() {
  const endpoint = process.env.FREDY_CHALLENGE_SOLVER_URL?.trim();
  return endpoint ? endpoint : null;
}

/**
 * Read a solver's answer, whichever of the two shapes it uses: fields at the top level, or the
 * FlareSolverr shape that nests them under `solution` and names the page `response`.
 *
 * @param {any} payload the decoded response body
 * @returns {{html: string, cookies: any[], userAgent: string|undefined}|null}
 */
function readSolverAnswer(payload) {
  const solution = payload?.solution ?? payload;
  const html = solution?.html ?? solution?.response;
  if (typeof html !== 'string' || html.length === 0) return null;
  return {
    html,
    cookies: Array.isArray(solution?.cookies) ? solution.cookies : [],
    userAgent: typeof solution?.userAgent === 'string' ? solution.userAgent : undefined,
  };
}

/**
 * Ask the configured solver to render a page the portal will not serve.
 *
 * @param {string} url the page to render
 * @param {string} context the provider asking, which is what the log lines name
 * @returns {Promise<{html: string, cookies: any[], userAgent: string|undefined}|null>} the answer,
 *   or null when no solver is configured or it did not get through
 */
export async function solveChallenge(url, context) {
  const endpoint = challengeSolverUrl();
  if (endpoint == null) return null;

  logger.debug(`${context}: asking ${endpoint} to clear the wall.`);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'request.get', url, maxTimeout: SOLVER_TIMEOUT_MS }),
      signal: AbortSignal.timeout(SOLVER_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.error(`${context}: the solver answered ${response.status} ${response.statusText}.`);
      return null;
    }

    const answer = readSolverAnswer(await response.json());
    if (answer == null) {
      logger.error(`${context}: the solver returned no page.`);
      return null;
    }
    return answer;
  } catch (error) {
    logger.error(`${context}: the solver did not get past the wall.`, error);
    return null;
  }
}
