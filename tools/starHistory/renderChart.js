/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Renders the star series as a standalone SVG - no dependencies, no web fonts, no external
 * references. GitHub proxies README images through camo and serves them into an `<img>`, which
 * means anything the SVG does not carry itself simply will not be there: a `<link>` to a font is
 * dropped, and script never runs. CSS animation inside the document does run, which is why the
 * line draws itself on load.
 *
 * Two variants (dark, light) are rendered and picked by `prefers-color-scheme` in the README, so
 * the chart follows whichever theme the reader uses - something the hosted services never did.
 */

/** @typedef {import('./starData.js').StarPoint} StarPoint */

/**
 * Palettes. Backgrounds are GitHub's own canvas colours so the chart sits flush in the README
 * instead of looking like a pasted-in card. Everything else is Fredy's own accent.
 */
const THEMES = {
  dark: {
    background: '#0d1117',
    grid: '#21262d',
    axis: '#30363d',
    text: '#e6edf3',
    muted: '#8b949e',
    faint: '#6e7681',
    accent: '#e0685a',
  },
  light: {
    background: '#ffffff',
    grid: '#eaeef2',
    axis: '#d0d7de',
    text: '#1f2328',
    muted: '#636c76',
    faint: '#8c959f',
    accent: '#c0564a',
  },
};

const WIDTH = 840;
const HEIGHT = 420;
const PADDING = { top: 62, right: 30, bottom: 52, left: 70 };

/** Candidate spacings for the "500 stars" style markers along the curve. */
const MILESTONE_STEPS = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];

/** Horizontal breathing room a milestone marker needs, from its neighbour and from the end dot. */
const MILESTONE_CLEARANCE = 70;

/**
 * Days since the epoch. The x axis is real time, not row index, so a quiet year takes up as much
 * width as a busy one and the shape of the curve stays honest.
 *
 * @param {string} date `YYYY-MM-DD`
 * @returns {number}
 */
function toDayNumber(date) {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

/**
 * @param {number} value
 * @returns {string} rounded to one decimal, without a trailing `.0`
 */
function coord(value) {
  return String(Math.round(value * 10) / 10);
}

/**
 * @param {number} value
 * @returns {string} e.g. `1,416`
 */
function formatNumber(value) {
  return value.toLocaleString('en-US');
}

/**
 * @param {string} value
 * @returns {string} safe to drop into markup or an attribute
 */
function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Picks axis ticks that land on readable numbers (1/2/5 x a power of ten) and returns the top one
 * as the axis maximum, so the curve never touches the ceiling.
 *
 * @param {number} max largest value in the series
 * @param {number} [count] target number of intervals
 * @returns {number[]} ascending ticks, starting at 0
 */
export function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1];

  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;

  const ticks = [];
  for (let value = 0; value < max + step; value += step) ticks.push(Math.round(value));
  return ticks;
}

/**
 * Decade ticks for the logarithmic axis: 1, 10, 100, ... up to the largest one the series reaches.
 *
 * @param {number} max largest value in the series
 * @returns {number[]} ascending ticks, starting at 1
 */
export function logTicks(max) {
  const ticks = [];
  for (let tick = 1; tick <= Math.max(max, 1); tick *= 10) ticks.push(tick);
  return ticks;
}

/**
 * Builds the vertical scale.
 *
 * The three options trade the same thing off against each other, because a project that spent
 * years in the low hundreds and then went vertical cannot show both halves at full strength:
 *
 *  - `linear` keeps the drama - the takeoff is a wall - but presses the first years flat onto the
 *    baseline, where nothing about them can be read.
 *  - `log` makes a constant growth *rate* a straight line, so every year is legible, but that is
 *    exactly what flattens the explosion out of the picture.
 *  - `sqrt` sits between the two: the early years lift far enough off the baseline to have a
 *    shape, and the recent months still climb steeply. Its ticks stay ordinary round numbers, only
 *    spaced unevenly, so nobody has to read decades to understand the picture.
 *
 * @param {'sqrt'|'log'|'linear'} scale
 * @param {number} max largest value in the series
 * @returns {{ticks: number[], yOf: (stars: number) => number}}
 */
function createYScale(scale, max) {
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const baseline = PADDING.top + plotHeight;

  if (scale === 'linear') {
    const ticks = niceTicks(max);
    const yMax = ticks.at(-1);
    return { ticks, yOf: (stars) => baseline - (stars / yMax) * plotHeight };
  }

  if (scale === 'log') {
    // log10(0) is -Infinity, so the axis starts at one star rather than at zero. Below ten stars
    // the top is pinned to ten, otherwise a brand new repository draws a single huge step. The
    // extra 8% is headroom: without it the newest point sits exactly on the ceiling and its marker
    // is cut in half by the edge of the plot.
    const top = Math.log10(Math.max(max, 10)) * 1.08;
    return {
      ticks: logTicks(max),
      yOf: (stars) => baseline - (Math.log10(Math.max(stars, 1)) / top) * plotHeight,
    };
  }

  // Square root. Fewer ticks than the linear axis gets, because the spacing between them shrinks
  // towards the top and a full set would collide up there.
  const ticks = niceTicks(max, 3);
  const top = Math.sqrt(ticks.at(-1));
  return { ticks, yOf: (stars) => baseline - (Math.sqrt(Math.max(stars, 0)) / top) * plotHeight };
}

/**
 * Chooses the milestone spacing that yields at most `maxMarkers` markers.
 *
 * @param {number} max largest value in the series
 * @param {number} [maxMarkers]
 * @returns {number} spacing, e.g. 500
 */
function milestoneStep(max, maxMarkers = 3) {
  return MILESTONE_STEPS.find((step) => Math.floor(max / step) <= maxMarkers) ?? MILESTONE_STEPS.at(-1);
}

/**
 * Summarises recent growth for the subtitle. A repository that took years to reach its current
 * count and one that got there last month draw an identical end point, so the curve alone does not
 * say how alive the project is right now.
 *
 * @param {StarPoint[]} points ascending by date
 * @param {number} [days] window to look back over
 * @returns {string} e.g. `+312 in the last 30 days`, or an empty string when the series is shorter
 *                   than the window and the number would be meaningless
 */
export function growthSummary(points, days = 30) {
  const last = points.at(-1);
  const cutoff = toDayNumber(last.date) - days;
  if (toDayNumber(points[0].date) > cutoff) return '';

  // The most recent row at or before the cutoff - the curve is flat between recorded days.
  const before = points.filter((point) => toDayNumber(point.date) <= cutoff).at(-1);
  const gained = last.stars - (before?.stars ?? 0);
  if (gained <= 0) return '';

  return `+${formatNumber(gained)} in the last ${days} days`;
}

/**
 * Projects the series into pixel space.
 *
 * @param {StarPoint[]} points
 * @param {(stars: number) => number} yOf vertical scale from {@link createYScale}
 * @returns {{x: number, y: number, point: StarPoint}[]}
 */
function project(points, yOf) {
  const plotWidth = WIDTH - PADDING.left - PADDING.right;

  const firstDay = toDayNumber(points[0].date);
  const lastDay = toDayNumber(points.at(-1).date);
  // A single day of history would divide by zero; pin it to the right edge instead.
  const span = lastDay - firstDay || 1;

  return points.map((point) => ({
    x: PADDING.left + ((toDayNumber(point.date) - firstDay) / span) * plotWidth,
    y: yOf(point.stars),
    point,
  }));
}

/**
 * @param {{x: number, y: number}[]} projected
 * @returns {number} total length of the polyline, used to seed the draw-on animation
 */
function polylineLength(projected) {
  let length = 0;
  for (let i = 1; i < projected.length; i++) {
    length += Math.hypot(projected[i].x - projected[i - 1].x, projected[i].y - projected[i - 1].y);
  }
  return Math.ceil(length);
}

/**
 * Year labels along the x axis, thinned out so they never collide.
 *
 * @param {StarPoint[]} points
 * @param {(date: string) => number} xOf
 * @returns {{x: number, label: string}[]}
 */
function yearTicks(points, xOf) {
  const firstYear = Number(points[0].date.slice(0, 4));
  const lastYear = Number(points.at(-1).date.slice(0, 4));

  const years = [];
  for (let year = firstYear; year <= lastYear; year++) years.push(year);

  const every = Math.ceil(years.length / 8);
  return years
    .filter((_, index) => index % every === 0)
    .map((year) => ({ x: xOf(`${year}-01-01`), label: String(year) }));
}

/**
 * Renders the chart.
 *
 * @param {StarPoint[]} points ascending by date, at least one
 * @param {Object} options
 * @param {'dark'|'light'} options.theme
 * @param {string} options.repo `owner/name`, shown as the title
 * @param {string} [options.generatedAt] `YYYY-MM-DD` shown in the footer
 * @param {'sqrt'|'log'|'linear'} [options.scale] vertical scale, square root by default
 * @returns {string} a complete, self contained SVG document
 * @throws {Error} if the series is empty
 */
export function renderStarChart(points, { theme = 'dark', repo, generatedAt, scale = 'sqrt' } = {}) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error('Cannot render a star chart without any data points');
  }

  const colors = THEMES[theme] ?? THEMES.dark;
  // One point is still worth drawing; duplicate it so every downstream step has a segment.
  const series = points.length === 1 ? [points[0], points[0]] : points;

  const total = series.at(-1).stars;
  const { ticks, yOf } = createYScale(scale, total);

  const projected = project(series, yOf);
  const baseline = HEIGHT - PADDING.bottom;
  const right = WIDTH - PADDING.right;

  const firstDay = toDayNumber(series[0].date);
  const lastDay = toDayNumber(series.at(-1).date);
  const span = lastDay - firstDay || 1;
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const xOf = (date) => {
    const clamped = Math.min(Math.max(toDayNumber(date), firstDay), lastDay);
    return PADDING.left + ((clamped - firstDay) / span) * plotWidth;
  };

  const linePath = projected.map(({ x, y }, i) => `${i === 0 ? 'M' : 'L'}${coord(x)},${coord(y)}`).join(' ');
  const areaPath = `M${coord(projected[0].x)},${coord(baseline)} ${linePath.slice(1)} L${coord(projected.at(-1).x)},${coord(baseline)} Z`;
  const lineLength = polylineLength(projected);

  const gridLines = ticks
    .map((tick) => {
      const y = yOf(tick);
      return `
    <line x1="${coord(PADDING.left)}" y1="${coord(y)}" x2="${coord(right)}" y2="${coord(y)}" stroke="${colors.grid}" stroke-width="1"/>
    <text x="${coord(PADDING.left - 12)}" y="${coord(y + 4)}" text-anchor="end" class="tick">${formatNumber(tick)}</text>`;
    })
    .join('');

  const xLabels = yearTicks(series, xOf)
    .map(
      ({ x, label }) =>
        `\n    <text x="${coord(x)}" y="${coord(baseline + 24)}" text-anchor="middle" class="tick">${label}</text>`,
    )
    .join('');

  // Markers sit on the day the repository crossed each round number. On a curve that shot up at the
  // very end they would all pile onto the same few pixels, so any marker that cannot keep clear of
  // its neighbour or of the end dot is dropped rather than drawn on top of them.
  const step = milestoneStep(total);
  const milestones = [];
  let lastMarkerX = -Infinity;
  for (let threshold = step; threshold <= total; threshold += step) {
    const crossing = projected.find(({ point }) => point.stars >= threshold);
    if (crossing == null) continue;
    if (crossing.x > right - MILESTONE_CLEARANCE || crossing.x - lastMarkerX < MILESTONE_CLEARANCE) continue;
    lastMarkerX = crossing.x;
    milestones.push(`
    <g class="milestone">
      <line x1="${coord(crossing.x)}" y1="${coord(crossing.y)}" x2="${coord(crossing.x)}" y2="${coord(baseline)}" stroke="${colors.accent}" stroke-width="1" stroke-dasharray="2 3" opacity="0.35"/>
      <circle cx="${coord(crossing.x)}" cy="${coord(crossing.y)}" r="3.5" fill="${colors.background}" stroke="${colors.accent}" stroke-width="2"/>
      <text x="${coord(crossing.x)}" y="${coord(crossing.y - 12)}" text-anchor="middle" class="milestone-label">${formatNumber(threshold)}</text>
    </g>`);
  }

  const end = projected.at(-1);
  const footer = generatedAt ? `updated ${escapeXml(generatedAt)}` : '';
  const growth = growthSummary(series);
  const subtitle = growth === '' ? 'Star history' : `Star history &#183; ${growth}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${escapeXml(repo ?? 'repository')} star history: ${formatNumber(total)} stars">
  <defs>
    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${colors.accent}" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="${colors.accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
    .tick { fill: ${colors.faint}; font-size: 11px; }
    .title { fill: ${colors.text}; font-size: 15px; font-weight: 600; }
    .subtitle { fill: ${colors.muted}; font-size: 12px; }
    .total { fill: ${colors.accent}; font-size: 26px; font-weight: 700; }
    .total-label { fill: ${colors.muted}; font-size: 11px; letter-spacing: 0.08em; }
    .milestone-label { fill: ${colors.muted}; font-size: 10px; font-weight: 600; }
    .footer { fill: ${colors.faint}; font-size: 10px; }

    .line { stroke-dasharray: ${lineLength}; stroke-dashoffset: ${lineLength}; animation: draw 2.4s cubic-bezier(0.22, 0.61, 0.36, 1) forwards; }
    .fill { opacity: 0; animation: appear 1.4s ease-out 0.9s forwards; }
    .milestone { opacity: 0; animation: appear 0.6s ease-out 1.9s forwards; }
    .end { opacity: 0; animation: appear 0.5s ease-out 2.3s forwards; }
    .halo { transform-origin: ${coord(end.x)}px ${coord(end.y)}px; animation: pulse 2.8s ease-in-out 2.8s infinite; }

    @keyframes draw { to { stroke-dashoffset: 0; } }
    @keyframes appear { to { opacity: 1; } }
    @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.22; } 50% { transform: scale(1.5); opacity: 0.05; } }

    @media (prefers-reduced-motion: reduce) {
      .line { stroke-dashoffset: 0; animation: none; }
      .fill, .milestone, .end { opacity: 1; animation: none; }
      .halo { animation: none; }
    }
  </style>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="${colors.background}"/>

  <text x="${coord(PADDING.left - 42)}" y="30" class="title">${escapeXml(repo ?? '')}</text>
  <text x="${coord(PADDING.left - 42)}" y="47" class="subtitle">${subtitle}</text>
  <text x="${coord(right)}" y="34" text-anchor="end" class="total">${formatNumber(total)}</text>
  <text x="${coord(right)}" y="49" text-anchor="end" class="total-label">STARS</text>
${gridLines}
  <line x1="${coord(PADDING.left)}" y1="${coord(baseline)}" x2="${coord(right)}" y2="${coord(baseline)}" stroke="${colors.axis}" stroke-width="1"/>${xLabels}

  <path class="fill" d="${areaPath}" fill="url(#area)"/>
  <path class="line" d="${linePath}" fill="none" stroke="${colors.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
${milestones.join('')}

  <g class="end">
    <circle class="halo" cx="${coord(end.x)}" cy="${coord(end.y)}" r="9" fill="${colors.accent}" opacity="0.22"/>
    <circle cx="${coord(end.x)}" cy="${coord(end.y)}" r="4.5" fill="${colors.accent}" stroke="${colors.background}" stroke-width="2"/>
  </g>

  <text x="${coord(PADDING.left - 42)}" y="${HEIGHT - 12}" class="footer">${footer}</text>
</svg>
`;
}
