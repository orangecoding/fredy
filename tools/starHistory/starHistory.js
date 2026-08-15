/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Generates the star history chart that the README embeds.
 *
 * Run by `.github/workflows/star-history.yml`, or by hand:
 *
 *   GITHUB_TOKEN=<token> node tools/starHistory/starHistory.js
 *
 * Everything it produces is committed: the CSV is the durable record of the curve, the two SVGs
 * are what the README points at. Nothing is fetched at read time, so the chart cannot break for
 * visitors the way the hosted services did when GitHub restricted the stargazers endpoint.
 *
 * Without a token (or with one that lacks access to the stargazers endpoint) the run degrades to
 * appending a single observed count for today instead of failing - the curve then simply grows
 * forward from whatever is already in the CSV.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchStarCount, fetchStargazerDates } from './github.js';
import { renderStarChart } from './renderChart.js';
import { buildSeriesFromStargazers, mergeSeries, parseCsv, serializeCsv } from './starData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'doc', 'star-history');
const CSV_FILE = path.join(OUTPUT_DIR, 'star-history.csv');

const REPO = process.env.GITHUB_REPOSITORY || 'orangecoding/fredy';
const TOKEN = process.env.STAR_HISTORY_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;

/**
 * @returns {string} today in UTC, `YYYY-MM-DD`, matching the day GitHub's timestamps are in
 */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {string} file
 * @returns {import('./starData.js').StarPoint[]}
 */
function readExistingSeries(file) {
  if (!fs.existsSync(file)) return [];
  return parseCsv(fs.readFileSync(file, 'utf-8'));
}

async function main() {
  console.warn(`Building star history for ${REPO}`);

  const existing = readExistingSeries(CSV_FILE);
  console.warn(`  ${existing.length} day(s) already recorded`);

  const starredAt = await fetchStargazerDates(REPO, TOKEN);
  if (starredAt == null) {
    console.warn(
      TOKEN
        ? '  stargazers endpoint denied (needs an admin or collaborator token) - snapshot only'
        : '  no token given - snapshot only',
    );
  } else {
    console.warn(`  ${starredAt.length} stargazer timestamp(s) fetched`);
  }

  const derived = starredAt == null ? [] : buildSeriesFromStargazers(starredAt);
  const count = await fetchStarCount(REPO, TOKEN);
  const snapshot = [{ date: today(), stars: count, source: 'snapshot' }];

  const series = mergeSeries(existing, derived, snapshot);
  if (series.length === 0) {
    throw new Error('No data points - refusing to write an empty chart');
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(CSV_FILE, serializeCsv(series));

  for (const theme of ['dark', 'light']) {
    const svg = renderStarChart(series, { theme, repo: REPO, generatedAt: today() });
    fs.writeFileSync(path.join(OUTPUT_DIR, `star-history-${theme}.svg`), svg);
  }

  console.warn(`Done: ${series.length} day(s), ${count} stars`);
}

main().catch((error) => {
  console.error(`Star history failed: ${error.message}`);
  process.exit(1);
});
