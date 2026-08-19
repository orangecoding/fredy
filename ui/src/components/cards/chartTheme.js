/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title as ChartTitle,
  Tooltip,
} from 'chart.js';

import { formatEuroPrice } from '../../services/price/priceService.js';

/*
 * Chart colours and typography, read from the theme rather than copied out of it.
 *
 * A chart is painted onto a canvas, so it cannot inherit a colour the way an element does: every
 * value has to be handed to chart.js as a concrete string. Reading them from the custom properties
 * in themes.less at the moment they are needed is what lets one set of chart code serve both
 * themes, and it removes the hand-maintained duplicate of the palette this file used to carry.
 *
 * The fallbacks are the dark palette, and only apply where there is no document to read from -
 * server-side rendering and unit tests.
 */

/**
 * Resolve one theme token to the colour the document is currently using.
 *
 * @param {string} name Custom property name, e.g. `--f-accent`.
 * @param {string} fallback Value to use when no document is available.
 * @returns {string}
 */
function token(name, fallback) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || document.body == null) {
    return fallback;
  }
  const value = window.getComputedStyle(document.body).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}

const FONT_UI = "'Outfit', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

/**
 * Series colours, accent first so the primary scenario is always Fredy red and every other
 * scenario reads as a comparison against it.
 *
 * A function rather than a constant: the colours belong to whichever theme is on screen when the
 * chart draws, and an array captured at import time would be the wrong one after a switch.
 *
 * @returns {string[]}
 */
export function chartPalette() {
  return [
    CHART_COLORS.ACCENT,
    CHART_COLORS.BLUE,
    CHART_COLORS.GREEN,
    CHART_COLORS.WARNING,
    CHART_COLORS.PURPLE,
    CHART_COLORS.ORANGE,
  ];
}

/**
 * Verdict colours, shared by the charts, the listing chips and the detail card.
 *
 * Getters rather than values, for the reason given on {@link chartPalette}: every read has to see
 * the theme that is on screen now. Call sites are unaffected - `VERDICT_COLORS.affordable` still
 * reads as a plain property.
 *
 * @type {{affordable: string, stretch: string, unaffordable: string}}
 */
export const VERDICT_COLORS = {
  get affordable() {
    return token('--f-success', '#4bab86');
  },
  get stretch() {
    return token('--f-warning', '#d8a34a');
  },
  get unaffordable() {
    return token('--f-error', '#d4707c');
  },
};

/**
 * The chart surface - axes, gridlines, tooltip and label colours - plus the named hues a chart
 * reaches for when it needs to tell several series apart, and the two font stacks.
 *
 * Getters, for the same reason as {@link VERDICT_COLORS}.
 *
 * @type {Record<'ACCENT'|'GRID'|'GRID_BRIGHT'|'MUTED'|'TEXT'|'ELEVATED'|'BLUE'|'GREEN'|'PURPLE'|'ORANGE'|'WARNING'|'SUCCESS'|'ERROR'|'FONT_UI'|'FONT_MONO', string>}
 */
export const CHART_COLORS = {
  get ACCENT() {
    return token('--f-accent', '#c0564a');
  },
  get GRID() {
    return token('--f-border', '#2a2a2a');
  },
  get GRID_BRIGHT() {
    return token('--f-border-bright', '#383838');
  },
  get MUTED() {
    return token('--f-muted', '#909090');
  },
  get TEXT() {
    return token('--f-text', '#efefef');
  },
  get ELEVATED() {
    return token('--f-elevated', '#1e1e1e');
  },
  get BLUE() {
    return token('--f-blue-text', '#7ba7d4');
  },
  get GREEN() {
    return token('--f-green-text', '#6cb597');
  },
  get PURPLE() {
    return token('--f-purple-text', '#9d8fc9');
  },
  get ORANGE() {
    return token('--f-orange-text', '#d69460');
  },
  get WARNING() {
    return token('--f-warning', '#d8a34a');
  },
  get SUCCESS() {
    return token('--f-success', '#4bab86');
  },
  get ERROR() {
    return token('--f-error', '#d4707c');
  },
  FONT_UI,
  FONT_MONO,
};

let registered = false;

/**
 * Register the chart.js pieces the finance charts need.
 *
 * chart.js v4 is tree-shaken, so anything not registered silently fails to draw. Called from
 * each chart component; the flag keeps repeat calls free.
 *
 * @returns {void}
 */
export function registerFinanceCharts() {
  if (registered) {
    return;
  }
  ChartJS.register(
    LineElement,
    PointElement,
    BarElement,
    LinearScale,
    CategoryScale,
    Filler,
    ArcElement,
    Tooltip,
    Legend,
    ChartTitle,
  );
  registered = true;
}

/**
 * Format a value as whole euros. Cents are noise on six-figure sums.
 *
 * @param {number} value
 * @param {string} [locale='de-DE']
 * @returns {string}
 */
export function formatEuro(value, locale = 'de-DE') {
  if (value == null || !Number.isFinite(Number(value))) {
    return '–';
  }
  // Rounded before it is handed over: `formatEuroPrice` keeps the cents a value actually has, and
  // on an axis label or a tooltip those two digits are exactly the noise this function exists to
  // drop. What is left is the same grouping and symbol the listings use.
  return formatEuroPrice(Math.round(Number(value)), locale);
}

/**
 * Compact euro formatting for axis ticks, where "250k" beats "250.000 €".
 *
 * @param {number} value
 * @param {string} [locale='de-DE']
 * @returns {string}
 */
export function formatEuroCompact(value, locale = 'de-DE') {
  if (value == null || !Number.isFinite(Number(value))) {
    return '';
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value));
}

/**
 * Shared chart.js options, in whichever theme is on screen.
 *
 * @param {Object} [options]
 * @param {string} [options.locale='de-DE']
 * @param {boolean} [options.legend=false] Show the legend (only useful with several series).
 * @returns {Object}
 */
export function baseChartOptions({ locale = 'de-DE', legend = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: legend,
        position: 'top',
        align: 'end',
        labels: {
          color: CHART_COLORS.MUTED,
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: 'circle',
          font: { family: FONT_UI, size: 12 },
        },
      },
      title: { display: false },
      tooltip: {
        backgroundColor: CHART_COLORS.ELEVATED,
        borderColor: CHART_COLORS.GRID_BRIGHT,
        borderWidth: 1,
        titleColor: CHART_COLORS.TEXT,
        bodyColor: CHART_COLORS.MUTED,
        padding: 10,
        cornerRadius: 6,
        displayColors: true,
        titleFont: { family: FONT_MONO, size: 12 },
        bodyFont: { family: FONT_UI, size: 12 },
      },
    },
    scales: {
      x: {
        grid: { color: 'transparent', drawBorder: false },
        border: { color: CHART_COLORS.GRID },
        ticks: { color: CHART_COLORS.MUTED, font: { family: FONT_UI, size: 11 }, maxRotation: 0, autoSkipPadding: 16 },
      },
      y: {
        grid: { color: CHART_COLORS.GRID, drawBorder: false },
        border: { display: false },
        ticks: {
          color: CHART_COLORS.MUTED,
          font: { family: FONT_MONO, size: 11 },
          callback: (value) => formatEuroCompact(value, locale),
        },
      },
    },
  };
}

/**
 * Vertical gradient from a colour down to transparent, for filled area charts.
 *
 * Chart.js hands the scriptable option a context whose chartArea is undefined on the very
 * first render pass, so this returns a flat fallback until the layout is known.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{top: number, bottom: number}|undefined} chartArea
 * @param {string} hex Base colour.
 * @param {number} [opacity=0.32] Opacity at the top of the gradient.
 * @returns {CanvasGradient|string}
 */
export function makeAreaGradient(ctx, chartArea, hex, opacity = 0.32) {
  if (!chartArea) {
    return withAlpha(hex, opacity / 2);
  }
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, withAlpha(hex, opacity));
  gradient.addColorStop(1, withAlpha(hex, 0));
  return gradient;
}

/**
 * Apply an alpha channel to a #rrggbb colour.
 *
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
export function withAlpha(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Chart.js plugin that shades the Zinsbindung window and marks where it ends.
 *
 * This is the one thing a German buyer most needs to see and that a plain debt curve hides:
 * inside the shaded years the rate is locked, and at its edge the Restschuld has to be
 * refinanced at whatever rates exist then.
 *
 * @type {import('chart.js').Plugin}
 */
export const zinsbindungBandPlugin = {
  id: 'zinsbindungBand',
  beforeDatasetsDraw(chart, _args, options) {
    const endYear = options?.endYear;
    if (!endYear || endYear <= 0) {
      return;
    }
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.x) {
      return;
    }

    // The x scale is categorical (one label per year), so index endYear - 1 is its last year.
    const endPixel = scales.x.getPixelForValue(Math.min(endYear - 1, scales.x.max));
    if (!Number.isFinite(endPixel)) {
      return;
    }

    ctx.save();
    ctx.fillStyle = withAlpha(CHART_COLORS.ACCENT, 0.06);
    ctx.fillRect(chartArea.left, chartArea.top, endPixel - chartArea.left, chartArea.bottom - chartArea.top);

    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = withAlpha(CHART_COLORS.ACCENT, 0.55);
    ctx.lineWidth = 1;
    ctx.moveTo(endPixel, chartArea.top);
    ctx.lineTo(endPixel, chartArea.bottom);
    ctx.stroke();

    if (options.label) {
      ctx.setLineDash([]);
      ctx.fillStyle = CHART_COLORS.MUTED;
      ctx.font = `11px ${FONT_UI}`;
      ctx.textAlign = endPixel > chartArea.left + (chartArea.right - chartArea.left) / 2 ? 'right' : 'left';
      const offset = ctx.textAlign === 'right' ? -6 : 6;
      ctx.fillText(options.label, endPixel + offset, chartArea.top + 12);
    }
    ctx.restore();
  },
};
