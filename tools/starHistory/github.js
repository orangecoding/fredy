/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The two GitHub reads the star chart needs.
 *
 * Since 2026-06-30 `/repos/{owner}/{repo}/stargazers` is limited to admins and collaborators, which
 * is why every third party star chart service broke. Running inside this repository we are on the
 * right side of that line, so the full history is still reachable - but only with a token, and the
 * fetch has to survive losing that access without taking the workflow down.
 *
 * `stargazers_count` on the repository endpoint stayed public. It carries no history, but it is the
 * one number that cannot be taken away, so it is the permanent fallback.
 */

const API = 'https://api.github.com';
const PER_PAGE = 100;

/**
 * @param {string|null} token
 * @param {string} accept
 * @returns {Record<string, string>}
 */
function headers(token, accept) {
  return {
    accept,
    'user-agent': 'fredy-star-history',
    'x-github-api-version': '2022-11-28',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Reads the public star count. Needs no token.
 *
 * @param {string} repo `owner/name`
 * @param {string|null} [token] optional, only used to get a higher rate limit
 * @returns {Promise<number>} current star count
 * @throws {Error} if the repository cannot be read at all
 */
export async function fetchStarCount(repo, token = null) {
  const response = await fetch(`${API}/repos/${repo}`, {
    headers: headers(token, 'application/vnd.github+json'),
  });

  if (!response.ok) {
    throw new Error(`Could not read ${repo}: ${response.status} ${response.statusText}`);
  }

  const { stargazers_count: count } = await response.json();
  return count;
}

/**
 * Reads every stargazer's `starred_at`, paging through the whole list.
 *
 * Returns `null` instead of throwing when GitHub denies access (401/403/404), because that is the
 * expected outcome for anyone who is not an admin or collaborator of the repository. The caller
 * then falls back to snapshots, which is a degraded chart rather than a failed run.
 *
 * @param {string} repo `owner/name`
 * @param {string|null} token token of an admin or collaborator
 * @returns {Promise<string[]|null>} ISO timestamps, or `null` if the endpoint is not accessible
 */
export async function fetchStargazerDates(repo, token) {
  if (!token) return null;

  const timestamps = [];

  for (let page = 1; ; page++) {
    const url = `${API}/repos/${repo}/stargazers?per_page=${PER_PAGE}&page=${page}`;
    const response = await fetch(url, {
      headers: headers(token, 'application/vnd.github.star+json'),
    });

    if ([401, 403, 404].includes(response.status)) return null;
    if (!response.ok) {
      throw new Error(`Stargazer page ${page} failed: ${response.status} ${response.statusText}`);
    }

    const batch = await response.json();
    // The star media type is what turns the plain user list into `{ starred_at, user }`. Without
    // it the response still parses, so guard rather than trust the header was honoured.
    for (const entry of batch) {
      if (entry?.starred_at) timestamps.push(entry.starred_at);
    }

    if (batch.length < PER_PAGE) break;
  }

  return timestamps;
}
