/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Presentation helpers for departure boards. Kept free of React so they can be unit tested.
 */

/**
 * Fallback colours per MOTIS mode, used when the timetable feed carries no line colour of its own.
 * They mirror the German convention: green S-Bahn, blue U-Bahn, red tram, purple regional rail.
 * @type {Record<string, string>}
 */
const MODE_COLORS = {
  SUBWAY: '#2563eb',
  METRO: '#2563eb',
  TRAM: '#ef4444',
  BUS: '#059669',
  COACH: '#059669',
  RAIL: '#7c3aed',
  HIGHSPEED_RAIL: '#7c3aed',
  LONG_DISTANCE: '#7c3aed',
  NIGHT_RAIL: '#7c3aed',
  REGIONAL_RAIL: '#7c3aed',
  REGIONAL_FAST_RAIL: '#7c3aed',
  FERRY: '#0891b2',
};

const DEFAULT_MODE_COLOR = '#64748b';

/**
 * The colour a line badge is painted in.
 *
 * @param {{mode?: string, color?: string|null}} departure
 * @returns {string} A CSS colour.
 */
export function departureColor(departure) {
  if (departure?.color) {
    return departure.color;
  }
  return MODE_COLORS[departure?.mode] ?? DEFAULT_MODE_COLOR;
}

/**
 * Picks black or white text for a badge background, so a light line colour stays readable.
 *
 * @param {string} background - `#rgb` or `#rrggbb`.
 * @returns {string}
 */
export function contrastingTextColor(background) {
  const hex = String(background || '').replace('#', '');
  const full = hex.length === 3 ? [...hex].map((char) => char + char).join('') : hex;

  if (full.length !== 6 || Number.isNaN(Number.parseInt(full, 16))) {
    return '#ffffff';
  }

  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);
  // Rec. 601 luma - good enough to decide between two text colours.
  const luma = (red * 299 + green * 587 + blue * 114) / 1000;

  return luma > 150 ? '#111827' : '#ffffff';
}

/**
 * Translation key for a MOTIS mode, so the UI can name it in the user's language.
 *
 * @param {string} mode
 * @returns {string}
 */
export function modeLabelKey(mode) {
  return `transit.mode.${(mode || 'UNKNOWN').toLowerCase()}`;
}

/**
 * Whole minutes from now until a departure, rounded down. Negative once it has left.
 *
 * @param {string} isoTime
 * @param {number} [now=Date.now()]
 * @returns {number}
 */
export function minutesUntil(isoTime, now = Date.now()) {
  return Math.floor((new Date(isoTime).getTime() - now) / 60000);
}

/**
 * The wall clock time of a departure, e.g. `15:37`.
 *
 * @param {string} isoTime
 * @param {string} [locale='de-DE']
 * @returns {string}
 */
export function formatClockTime(isoTime, locale = 'de-DE') {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(isoTime));
}

/**
 * The countdown shown next to a departure: `now` while it is leaving, `in 4 min` before that, and
 * nothing at all for departures more than an hour out - the clock time says it better by then.
 *
 * @param {string} isoTime
 * @param {(key: string, vars?: Record<string, string|number>) => string} t
 * @param {number} [now=Date.now()]
 * @returns {string|null}
 */
export function formatCountdown(isoTime, t, now = Date.now()) {
  const minutes = minutesUntil(isoTime, now);

  if (minutes < 0) {
    return null;
  }
  if (minutes < 1) {
    return t('transit.departingNow');
  }
  if (minutes > 60) {
    return null;
  }
  return t('transit.inMinutes', { minutes });
}

/**
 * The distinct lines calling at a stop, in the order they next depart.
 *
 * This is what answers "which train runs here": the tiles the map draws its rails from carry no
 * line numbers at all, so the departure board is the only place that knows.
 *
 * @param {Array<{line: string, mode: string, color: string|null}>} departures
 * @returns {Array<{line: string, mode: string, color: string|null}>}
 */
export function distinctLines(departures) {
  const seen = new Map();

  for (const departure of departures || []) {
    const key = `${departure.mode}:${departure.line}`;
    if (departure.line && !seen.has(key)) {
      seen.set(key, { line: departure.line, mode: departure.mode, color: departure.color });
    }
  }

  return [...seen.values()];
}

/**
 * A walking distance in the units people use: metres below a kilometre, one decimal above.
 *
 * @param {number} meters
 * @returns {string}
 */
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return '';
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * A journey duration in the units people use: minutes below an hour, `h min` above.
 *
 * @param {number} minutes
 * @param {Object} [units]
 * @param {string} [units.minuteUnit='min'] - Short unit for minutes, e.g. `min` or `dk`.
 * @param {string} [units.hourUnit='h'] - Short unit for hours, e.g. `h` or `sa`.
 * @returns {string}
 */
export function formatDuration(minutes, { minuteUnit = 'min', hourUnit = 'h' } = {}) {
  if (!Number.isFinite(minutes)) {
    return '';
  }
  if (minutes < 60) {
    return `${Math.round(minutes)} ${minuteUnit}`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${hours} ${hourUnit}` : `${hours} ${hourUnit} ${rest} ${minuteUnit}`;
}
