/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fetch from 'node-fetch';
import { getPackageVersion } from '../../utils.js';
import semver from 'semver';
import logger from '../../services/logger.js';
import { markdownToSafeHtml, releaseOutline } from '../../services/markdown.js';

/**
 * How long a GitHub answer is reused.
 *
 * The unauthenticated GitHub API allows 60 requests per hour per address. This endpoint is hit on
 * every app boot, so without a cache a handful of users reloading exhausts the quota - and the
 * rate-limited response has no `tag_name`, which used to make `semver.gte` throw and turn the
 * endpoint into a 500.
 * @type {number}
 */
const VERSION_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * How many installed releases the What's New sheet lists. The dialog after an upgrade only ever
 * shows the first of them.
 * @type {number}
 */
const NEWS_RELEASE_COUNT = 6;

/**
 * One release as the What's New views receive it, already rendered.
 *
 * @typedef {Object} NewsRelease
 * @property {string} version The release tag.
 * @property {string} date ISO timestamp the release was published at.
 * @property {string} url The release page on GitHub.
 * @property {string} bodyHtml The release notes, sanitised HTML.
 * @property {{title: string, items: number}[]} outline The headings of the notes, for long ones.
 */

/**
 * One GitHub release as the browser shows it: the update dialog and the What's New views take the
 * same shape, so they render with the same components.
 *
 * @param {{tag_name: string, published_at: string, html_url: string, body: string|null}} release
 * @returns {NewsRelease}
 */
function toNewsRelease(release) {
  return {
    version: release.tag_name,
    date: release.published_at,
    url: release.html_url,
    bodyHtml: markdownToSafeHtml(release.body),
    outline: releaseOutline(release.body),
  };
}

/** @type {{at: number, versionPayload: Object|null, releases: NewsRelease[]}} */
let githubCache = { at: 0, versionPayload: null, releases: [] };

/**
 * Ask GitHub for the release list, at most once every {@link VERSION_CACHE_TTL_MS}.
 *
 * One request answers both questions: whether a newer version exists, and what the installed ones
 * brought. The list endpoint is used instead of `/releases/latest` because the What's New views
 * need more than the newest release, and asking twice would halve the quota for nothing.
 *
 * Failures and "no new version" are cached just like successes: when GitHub is rate-limiting us,
 * retrying on every request is precisely the wrong response.
 *
 * @returns {Promise<{versionPayload: ({newVersion: boolean, checked: true, localFredyVersion: string} & Partial<NewsRelease>)|null, releases: NewsRelease[]}>}
 *   `versionPayload` is `null` and `releases` empty when GitHub gave no usable answer.
 */
async function getReleasesFromGithub() {
  if (Date.now() - githubCache.at < VERSION_CACHE_TTL_MS) {
    return githubCache;
  }

  const localFredyVersion = await getPackageVersion();
  let versionPayload = null;
  let releases = [];
  try {
    const raw = await fetch('https://api.github.com/repos/orangecoding/fredy/releases?per_page=100');
    const data = await raw.json();
    // A rate-limit or error body is an object, not a list. Tags that are not valid semver are
    // dropped before semver gets to throw on them, so an unusable answer degrades to "no new
    // version" and no news.
    if (Array.isArray(data)) {
      const stable = data
        .filter((release) => !release?.draft && !release?.prerelease && semver.valid(release?.tag_name))
        .sort((a, b) => semver.rcompare(a.tag_name, b.tag_name));

      const latest = stable[0];
      if (latest != null) {
        versionPayload = semver.gte(localFredyVersion, latest.tag_name)
          ? // `checked` tells "GitHub says this is current" apart from "nobody could ask", which
            // share `newVersion: false`. The footer only claims "up to date" for the first.
            { newVersion: false, checked: true, localFredyVersion }
          : { newVersion: true, checked: true, localFredyVersion, ...toNewsRelease(latest) };
      }

      // Only what this installation actually runs. A release that is out but not installed yet is
      // the footer's update notice, not news.
      releases = stable
        .filter((release) => semver.lte(release.tag_name, localFredyVersion))
        .slice(0, NEWS_RELEASE_COUNT)
        .map(toNewsRelease);
    }
  } catch (error) {
    logger.warn('Could not fetch the Fredy releases from GitHub.', error?.message || error);
  }

  githubCache = { at: Date.now(), versionPayload, releases };
  return githubCache;
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function versionPlugin(fastify) {
  fastify.get('/', async () => {
    const { versionPayload } = await getReleasesFromGithub();
    const localFredyVersion = await getPackageVersion();
    return versionPayload ?? { newVersion: false, localFredyVersion };
  });

  /**
   * The newest installed releases with their notes, newest first. Feeds the What's New sheet and,
   * with its first entry, the dialog shown after an upgrade.
   */
  fastify.get('/releases', async () => {
    const { releases } = await getReleasesFromGithub();
    return releases;
  });
}
