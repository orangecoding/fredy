/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Pure data helpers for the star history chart. No network, no filesystem, so the whole
 * merge/serialise logic is unit testable without touching GitHub.
 *
 * Two very different things end up in the same series:
 *  - `stargazers` rows are *derived* from the `starred_at` timestamps of everyone who currently
 *    stars the repo. Exact, but blind to unstars: someone who starred in 2019 and unstarred in 2024
 *    never existed as far as that list is concerned, so the derived curve is slightly too low in
 *    the past.
 *  - `snapshot` rows are the *observed* `stargazers_count` at the moment a run happened. Coarse
 *    (one point per run) but true, unstars included.
 *
 * Snapshots therefore win over derived rows for the same day, and the CSV in the repo is the
 * durable record - once a day is written it survives, even if GitHub restricts the stargazers
 * endpoint further and the derived half stops working entirely.
 */

/**
 * A single day of the star curve.
 *
 * @typedef {Object} StarPoint
 * @property {string} date ISO day, `YYYY-MM-DD`
 * @property {number} stars cumulative star count on that day
 * @property {'stargazers'|'snapshot'} source how the value was obtained
 */

/** Precedence when two rows describe the same day. Higher wins. */
const SOURCE_RANK = { stargazers: 0, snapshot: 1 };

const CSV_HEADER = 'date,stars,source';

/**
 * Reduces an ISO timestamp to its day.
 *
 * @param {string} timestamp ISO 8601 timestamp, e.g. `2018-04-10T10:41:28Z`
 * @returns {string} `YYYY-MM-DD`
 */
export function toDay(timestamp) {
  return timestamp.slice(0, 10);
}

/**
 * Turns the `starred_at` timestamps of all current stargazers into a cumulative daily series.
 * Only days on which at least one star arrived produce a row - the renderer interpolates between
 * them, so writing the flat stretches out would only bloat the CSV.
 *
 * @param {string[]} starredAt ISO timestamps, any order
 * @returns {StarPoint[]} ascending by date
 */
export function buildSeriesFromStargazers(starredAt) {
  const perDay = new Map();
  for (const timestamp of starredAt) {
    const day = toDay(timestamp);
    perDay.set(day, (perDay.get(day) || 0) + 1);
  }

  let cumulative = 0;
  return [...perDay.keys()].sort().map((date) => {
    cumulative += perDay.get(date);
    return { date, stars: cumulative, source: 'stargazers' };
  });
}

/**
 * Merges series into one, keeping a single row per day.
 *
 * @param {...StarPoint[]} series in ascending precedence order - later arguments win ties
 * @returns {StarPoint[]} merged, ascending by date
 */
export function mergeSeries(...series) {
  const byDate = new Map();

  for (const points of series) {
    for (const point of points) {
      const existing = byDate.get(point.date);
      // A snapshot is an observation and always beats a value derived from the stargazer list.
      if (existing != null && SOURCE_RANK[existing.source] > SOURCE_RANK[point.source]) continue;
      byDate.set(point.date, point);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Parses the committed CSV. Malformed and unparseable lines are skipped rather than thrown on:
 * the file is the only copy of the history, so a single bad row must not take the whole run down.
 *
 * @param {string} csv file contents, may be empty
 * @returns {StarPoint[]} ascending by date
 */
export function parseCsv(csv) {
  const points = [];

  for (const line of csv.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed === CSV_HEADER) continue;

    const [date, stars, source] = trimmed.split(',');
    const parsedStars = Number(stars);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !Number.isFinite(parsedStars)) continue;

    points.push({ date, stars: parsedStars, source: source === 'snapshot' ? 'snapshot' : 'stargazers' });
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Serialises the series back into the committed CSV.
 *
 * @param {StarPoint[]} points
 * @returns {string} CSV including header and trailing newline
 */
export function serializeCsv(points) {
  const rows = points.map(({ date, stars, source }) => `${date},${stars},${source}`);
  return [CSV_HEADER, ...rows].join('\n') + '\n';
}
