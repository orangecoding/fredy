/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * One shipped release, as `ui/src/assets/news/news.json` declares it.
 *
 * @typedef {Object} NewsRelease
 * @property {string} version Semantic version, matching the tag the release went out under.
 * @property {string} [date] ISO date, shown next to the version.
 * @property {NewsEntry[]} entries What is worth telling someone about, in reading order.
 *
 * @typedef {Object} NewsEntry
 * @property {string} title
 * @property {string} text Inline HTML, rendered as-is. Written in English and not translated:
 *   release prose changes every few weeks and would otherwise have to be written twice, with the
 *   German half going stale the first time somebody forgot.
 * @property {string} [media] File name under `ui/src/assets/news/`. `.mp4` renders as a video.
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
 * Whether a release is well-formed enough to show.
 *
 * A malformed entry is dropped rather than rendered: news.json is hand-edited on every release and
 * a missing field there must not take the dialog - or the page behind it - down with it.
 *
 * @param {any} release
 * @returns {boolean}
 */
function isUsable(release) {
  return (
    release != null &&
    typeof release === 'object' &&
    typeof release.version === 'string' &&
    release.version.length > 0 &&
    Array.isArray(release.entries) &&
    release.entries.some((entry) => entry != null && typeof entry.title === 'string')
  );
}

/**
 * Every release, newest first, with the unusable ones dropped.
 *
 * @param {any} config The parsed news.json.
 * @returns {NewsRelease[]}
 */
export function allReleases(config) {
  const releases = Array.isArray(config?.releases) ? config.releases : [];
  return releases
    .filter(isUsable)
    .map((release) => ({
      ...release,
      entries: release.entries.filter((entry) => entry != null && typeof entry.title === 'string'),
    }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * The releases someone has not been told about yet, oldest first.
 *
 * Oldest first because they are shown as consecutive steps and the story only makes sense in the
 * order it happened. Someone who skipped two releases gets both, which is the point: the previous
 * mechanism stored a single hash of the current payload, so skipping a release meant never hearing
 * about it.
 *
 * A `lastSeen` of null means "no marker stored" - a user created after this shipped. They are shown
 * nothing and the current version is recorded for them, because a brand new account being greeted
 * with the history of a product it has never used is noise, not news.
 *
 * @param {any} config The parsed news.json.
 * @param {string|null|undefined} lastSeen The newest version this user has been shown.
 * @returns {NewsRelease[]} Empty when there is nothing to say.
 */
export function selectUnseenReleases(config, lastSeen) {
  if (lastSeen == null || String(lastSeen).length === 0) {
    return [];
  }
  return allReleases(config)
    .filter((release) => compareVersions(release.version, lastSeen) > 0)
    .reverse();
}

/**
 * The newest version named in the file, used as the marker to store once the dialog is dismissed.
 *
 * Taken from news.json rather than from package.json: the marker has to mean "you have seen
 * everything this file holds", and a build whose version is ahead of the newest written release
 * would otherwise silently swallow that release when it is added later.
 *
 * @param {any} config The parsed news.json.
 * @returns {string|null}
 */
export function newestVersion(config) {
  return allReleases(config)[0]?.version ?? null;
}
