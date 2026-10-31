/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * One installed release, as `GET /api/version/releases` returns it: taken from the GitHub release
 * list, newest first, at most the six newest that are not newer than the running version.
 *
 * @typedef {Object} NewsRelease
 * @property {string} version Semantic version, the tag the release went out under.
 * @property {string} [date] ISO timestamp the release was published at.
 * @property {string} [url] The release page on GitHub.
 * @property {string} bodyHtml The release notes, rendered from markdown and sanitised server-side.
 * @property {{title: string, items: number}[]} [outline] The top-level headings of the notes, down
 *   to h3, each with the number of list items under it.
 */

/**
 * Compare two semantic versions.
 *
 * Only the numeric core is compared: a pre-release suffix ("25.1.0-rc.1") sorts as its release
 * would, which is the right answer here - somebody running a release candidate has already seen
 * what that release contains.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Negative when `a` is older, positive when newer, 0 when equal.
 */
export function compareVersions(a, b) {
  const parts = (value) =>
    String(value ?? '')
      .split('-')[0]
      .split('.')
      .map((piece) => Number.parseInt(piece, 10) || 0);

  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/**
 * The release to tell someone about after an upgrade: the newest installed one, if they have not
 * been shown it yet.
 *
 * Only the newest, even when several were skipped. Somebody coming from 29 to 30 wants to know what
 * 30 brought; the releases in between are in the What's New sheet for whoever cares.
 *
 * A `lastSeen` of null means "no marker stored" - a user created after this shipped. They are shown
 * nothing and the current version is recorded for them, because a brand new account being greeted
 * with the history of a product it has never used is noise, not news.
 *
 * @param {NewsRelease[]} releases Newest first, as the server sends them.
 * @param {string|null|undefined} lastSeen The newest version this user has been shown.
 * @returns {NewsRelease|null} `null` when there is nothing to say.
 */
export function selectUnseenRelease(releases, lastSeen) {
  const newest = Array.isArray(releases) ? releases[0] : null;
  if (newest == null || lastSeen == null || String(lastSeen).length === 0) {
    return null;
  }
  return compareVersions(newest.version, lastSeen) > 0 ? newest : null;
}

/**
 * The newest release in the list, used as the marker to store once the dialog is dismissed.
 *
 * Taken from the list rather than from the running version: the marker has to mean "you have seen
 * everything that was listed". While GitHub cannot be reached the list is empty, so nothing is
 * stored, and the news are still there to be shown once it answers again.
 *
 * @param {NewsRelease[]} releases Newest first, as the server sends them.
 * @returns {string|null}
 */
export function newestVersion(releases) {
  return (Array.isArray(releases) && releases[0]?.version) || null;
}
