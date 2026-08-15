/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { buildSeriesFromStargazers, mergeSeries, parseCsv, serializeCsv } from '../../tools/starHistory/starData.js';
import { growthSummary, logTicks, niceTicks, renderStarChart } from '../../tools/starHistory/renderChart.js';

/**
 * Builds a straight series of consecutive days, one star per day, for the render tests.
 *
 * @param {number} days
 * @returns {import('../../tools/starHistory/starData.js').StarPoint[]}
 */
function linearSeries(days) {
  return Array.from({ length: days }, (_, index) => ({
    date: new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10),
    stars: index + 1,
    source: 'stargazers',
  }));
}

describe('buildSeriesFromStargazers', () => {
  it('accumulates stars per day and ignores the order they arrive in', () => {
    const series = buildSeriesFromStargazers([
      '2024-03-02T09:00:00Z',
      '2024-01-01T10:00:00Z',
      '2024-03-02T23:59:59Z',
      '2024-01-01T11:00:00Z',
    ]);

    expect(series).toEqual([
      { date: '2024-01-01', stars: 2, source: 'stargazers' },
      { date: '2024-03-02', stars: 4, source: 'stargazers' },
    ]);
  });

  it('writes no row for days without a star', () => {
    const series = buildSeriesFromStargazers(['2024-01-01T10:00:00Z', '2024-06-01T10:00:00Z']);
    expect(series.map((point) => point.date)).toEqual(['2024-01-01', '2024-06-01']);
  });

  it('returns an empty series for an empty list', () => {
    expect(buildSeriesFromStargazers([])).toEqual([]);
  });
});

describe('mergeSeries', () => {
  it('lets an observed snapshot win over a value derived from the stargazer list', () => {
    // The derived value is too low because it cannot see anyone who unstarred in the meantime.
    const derived = [{ date: '2024-01-01', stars: 90, source: 'stargazers' }];
    const snapshot = [{ date: '2024-01-01', stars: 100, source: 'snapshot' }];

    expect(mergeSeries(derived, snapshot)).toEqual(snapshot);
    // Precedence is by source, not by argument order.
    expect(mergeSeries(snapshot, derived)).toEqual(snapshot);
  });

  it('keeps a recorded snapshot when a later run can no longer reach the stargazer list', () => {
    const recorded = [{ date: '2024-01-01', stars: 100, source: 'snapshot' }];
    const merged = mergeSeries(recorded, [], [{ date: '2024-01-02', stars: 101, source: 'snapshot' }]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual(recorded[0]);
  });

  it('prefers the later argument when both rows carry the same source', () => {
    const merged = mergeSeries(
      [{ date: '2024-01-01', stars: 10, source: 'snapshot' }],
      [{ date: '2024-01-01', stars: 12, source: 'snapshot' }],
    );

    expect(merged).toEqual([{ date: '2024-01-01', stars: 12, source: 'snapshot' }]);
  });

  it('sorts the result by date', () => {
    const merged = mergeSeries(
      [{ date: '2024-06-01', stars: 3, source: 'stargazers' }],
      [{ date: '2024-01-01', stars: 1, source: 'stargazers' }],
    );

    expect(merged.map((point) => point.date)).toEqual(['2024-01-01', '2024-06-01']);
  });
});

describe('csv round trip', () => {
  it('survives serialise and parse unchanged', () => {
    const points = [
      { date: '2018-04-10', stars: 1, source: 'stargazers' },
      { date: '2026-08-15', stars: 1416, source: 'snapshot' },
    ];

    expect(parseCsv(serializeCsv(points))).toEqual(points);
  });

  it('writes a header', () => {
    expect(serializeCsv([]).trim()).toBe('date,stars,source');
  });

  it('parses an empty file as an empty series', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('skips malformed rows instead of throwing, so one bad line cannot lose the history', () => {
    const csv = [
      'date,stars,source',
      'not-a-date,5,snapshot',
      '2024-01-01,nonsense,snapshot',
      '2024-01-02,7,snapshot',
    ].join('\n');

    expect(parseCsv(csv)).toEqual([{ date: '2024-01-02', stars: 7, source: 'snapshot' }]);
  });

  it('treats an unknown source as derived', () => {
    expect(parseCsv('2024-01-01,5,something-else')[0].source).toBe('stargazers');
  });
});

describe('niceTicks', () => {
  it('ends on a round number at or above the maximum', () => {
    for (const max of [7, 63, 412, 1416, 9001]) {
      const ticks = niceTicks(max);
      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)).toBeGreaterThanOrEqual(max);
    }
  });

  it('spaces ticks evenly', () => {
    const ticks = niceTicks(1416);
    const steps = ticks.slice(1).map((tick, index) => tick - ticks[index]);
    expect(new Set(steps).size).toBe(1);
  });

  it('does not divide by zero for an empty repository', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe('logTicks', () => {
  it('returns the decades the series actually reaches', () => {
    expect(logTicks(1416)).toEqual([1, 10, 100, 1000]);
    expect(logTicks(90)).toEqual([1, 10]);
  });

  it('returns a single tick for a repository with one star', () => {
    expect(logTicks(1)).toEqual([1]);
    expect(logTicks(0)).toEqual([1]);
  });
});

describe('growthSummary', () => {
  it('reports the stars gained inside the window', () => {
    expect(growthSummary(linearSeries(60), 30)).toBe('+30 in the last 30 days');
  });

  it('says nothing when the history is shorter than the window', () => {
    expect(growthSummary(linearSeries(10), 30)).toBe('');
  });

  it('says nothing when no star arrived inside the window', () => {
    const stale = [
      { date: '2024-01-01', stars: 100, source: 'stargazers' },
      { date: '2024-12-31', stars: 100, source: 'snapshot' },
    ];

    expect(growthSummary(stale, 30)).toBe('');
  });
});

describe('renderStarChart', () => {
  const series = linearSeries(400);

  it('renders a self contained svg without external references', () => {
    const svg = renderStarChart(series, { theme: 'dark', repo: 'owner/repo', generatedAt: '2026-08-15' });

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
    // Camo serves the file into an <img>: scripts never run and anything remote is dropped.
    expect(svg).not.toContain('<script');
    expect(svg).not.toMatch(/(?:href|src)=["']https?:/);
    expect(svg).not.toMatch(/@import|url\(["']?https?:/);
  });

  it('produces no NaN coordinates', () => {
    expect(renderStarChart(series, { theme: 'dark', repo: 'owner/repo' })).not.toContain('NaN');
  });

  it('shows the current total and the repository name', () => {
    const svg = renderStarChart(series, { theme: 'dark', repo: 'owner/repo' });

    expect(svg).toContain('>400<');
    expect(svg).toContain('owner/repo');
  });

  it('formats large totals with thousands separators', () => {
    expect(renderStarChart(linearSeries(1500), { theme: 'dark', repo: 'owner/repo' })).toContain('>1,500<');
  });

  it('draws a square root axis by default, labelled with ordinary round numbers', () => {
    const svg = renderStarChart(linearSeries(1500), { theme: 'dark', repo: 'owner/repo' });

    // Round numbers, unlike the decades a log axis would label.
    expect(svg).toContain('>500<');
    expect(svg).not.toContain('>1<');
  });

  it('lifts the early history off the baseline while keeping the late spike steep', () => {
    // Eight flat years around a hundred stars, then a jump to fourteen hundred - Fredy's own shape.
    const spike = [
      ...Array.from({ length: 8 }, (_, index) => ({
        date: `${2018 + index}-01-01`,
        stars: 10 + index * 12,
        source: 'stargazers',
      })),
      { date: '2026-08-15', stars: 1416, source: 'snapshot' },
    ];

    const yOf = (svg, index) => Number([...svg.matchAll(/[ML][\d.]+,([\d.]+)/g)][index][1]);
    const sqrt = renderStarChart(spike, { theme: 'dark', repo: 'owner/repo', scale: 'sqrt' });
    const linear = renderStarChart(spike, { theme: 'dark', repo: 'owner/repo', scale: 'linear' });

    // The last flat year sits markedly higher above the baseline than it would on a linear axis
    // (smaller y is further up), which is the whole point of the square root scale.
    expect(yOf(sqrt, 7)).toBeLessThan(yOf(linear, 7) - 40);
    // The final point still climbs into the top part of the plot rather than being flattened.
    expect(yOf(sqrt, 8)).toBeLessThan(120);
  });

  it('keeps the newest point clear of the top edge on every scale', () => {
    for (const scale of ['sqrt', 'log', 'linear']) {
      const svg = renderStarChart(linearSeries(1500), { theme: 'dark', repo: 'owner/repo', scale });
      const highest = Math.min(...[...svg.matchAll(/L[\d.]+,([\d.]+)/g)].map((match) => Number(match[1])));

      // The end marker has a radius of 4.5 and a halo of 9 around it, both of which must still fit.
      expect(highest, scale).toBeGreaterThan(9);
    }
  });

  it('can still draw logarithmic and linear axes', () => {
    const log = renderStarChart(linearSeries(1500), { theme: 'dark', repo: 'owner/repo', scale: 'log' });
    const linear = renderStarChart(linearSeries(1500), { theme: 'dark', repo: 'owner/repo', scale: 'linear' });

    for (const decade of ['>1<', '>10<', '>100<', '>1,000<']) expect(log).toContain(decade);
    expect(linear).toContain('>500<');
    expect(linear).toContain('>1,500<');
  });

  it('uses a different palette per theme', () => {
    const dark = renderStarChart(series, { theme: 'dark', repo: 'owner/repo' });
    const light = renderStarChart(series, { theme: 'light', repo: 'owner/repo' });

    expect(dark).toContain('#0d1117');
    expect(light).toContain('#ffffff');
    expect(dark).not.toBe(light);
  });

  it('keeps the animation optional for readers who ask for reduced motion', () => {
    expect(renderStarChart(series, { theme: 'dark', repo: 'owner/repo' })).toContain('prefers-reduced-motion');
  });

  it('escapes the repository name', () => {
    const svg = renderStarChart(series, { theme: 'dark', repo: 'owner/<script>&"' });

    expect(svg).toContain('owner/&lt;script&gt;&amp;&quot;');
    expect(svg).not.toContain('<script>');
  });

  it('draws milestone markers on a curve that has room for them', () => {
    // Steady growth over eleven years: the markers land far apart.
    const steady = Array.from({ length: 132 }, (_, index) => ({
      date: new Date(Date.UTC(2015, index, 1)).toISOString().slice(0, 10),
      stars: (index + 1) * 10,
      source: 'stargazers',
    }));

    expect(renderStarChart(steady, { theme: 'dark', repo: 'owner/repo' })).toContain('class="milestone"');
  });

  it('drops milestone markers that would collide on a curve that spikes at the end', () => {
    // Nothing for years, then everything in the last weeks - every marker lands on the same pixels.
    const spike = [
      { date: '2018-01-01', stars: 1, source: 'stargazers' },
      { date: '2026-07-20', stars: 500, source: 'stargazers' },
      { date: '2026-08-01', stars: 1000, source: 'stargazers' },
      { date: '2026-08-15', stars: 1416, source: 'snapshot' },
    ];

    expect(renderStarChart(spike, { theme: 'dark', repo: 'owner/repo' })).not.toContain('class="milestone"');
  });

  it('renders a repository with a single recorded day', () => {
    const svg = renderStarChart([{ date: '2024-01-01', stars: 1, source: 'snapshot' }], {
      theme: 'dark',
      repo: 'owner/repo',
    });

    expect(svg).toContain('</svg>');
    expect(svg).not.toContain('NaN');
  });

  it('refuses to render an empty series', () => {
    expect(() => renderStarChart([], { theme: 'dark', repo: 'owner/repo' })).toThrow(/without any data/);
  });
});
