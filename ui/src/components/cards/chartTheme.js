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

/*
 * Chart colours and typography, mirrored from ui/src/tokens.less.
 *
 * Less variables cannot be read from JavaScript, so these values are duplicated by hand.
 * When the palette changes in tokens.less, change it here too.
 */

/** @type {string} tokens.less @color-accent */
const ACCENT = '#e04a38';
/** @type {string} tokens.less @color-border */
const GRID = '#2a2a2a';
/** @type {string} tokens.less @color-border-bright */
const GRID_BRIGHT = '#383838';
/** @type {string} tokens.less @color-muted */
const MUTED = '#909090';
/** @type {string} tokens.less @color-text */
const TEXT = '#efefef';
/** @type {string} tokens.less @color-elevated */
const ELEVATED = '#1e1e1e';

const FONT_UI = "'Outfit', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

/**
 * Series colours, accent first so the primary scenario is always Fredy red and every other
 * scenario reads as a comparison against it.
 */
export const CHART_PALETTE = [ACCENT, '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb923c'];

/** Verdict colours, shared by the charts, the listing chips and the detail card. */
export const VERDICT_COLORS = {
  affordable: '#34d399',
  stretch: '#fbbf24',
  unaffordable: '#fb7185',
};

export const CHART_COLORS = { ACCENT, GRID, GRID_BRIGHT, MUTED, TEXT, ELEVATED, FONT_UI, FONT_MONO };

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
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number(value));
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
 * Shared chart.js options in the Fredy dark theme.
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
          color: MUTED,
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: 'circle',
          font: { family: FONT_UI, size: 12 },
        },
      },
      title: { display: false },
      tooltip: {
        backgroundColor: ELEVATED,
        borderColor: GRID_BRIGHT,
        borderWidth: 1,
        titleColor: TEXT,
        bodyColor: MUTED,
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
        border: { color: GRID },
        ticks: { color: MUTED, font: { family: FONT_UI, size: 11 }, maxRotation: 0, autoSkipPadding: 16 },
      },
      y: {
        grid: { color: GRID, drawBorder: false },
        border: { display: false },
        ticks: {
          color: MUTED,
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
    ctx.fillStyle = withAlpha(ACCENT, 0.06);
    ctx.fillRect(chartArea.left, chartArea.top, endPixel - chartArea.left, chartArea.bottom - chartArea.top);

    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = withAlpha(ACCENT, 0.55);
    ctx.lineWidth = 1;
    ctx.moveTo(endPixel, chartArea.top);
    ctx.lineTo(endPixel, chartArea.bottom);
    ctx.stroke();

    if (options.label) {
      ctx.setLineDash([]);
      ctx.fillStyle = MUTED;
      ctx.font = `11px ${FONT_UI}`;
      ctx.textAlign = endPixel > chartArea.left + (chartArea.right - chartArea.left) / 2 ? 'right' : 'left';
      const offset = ctx.textAlign === 'right' ? -6 : 6;
      ctx.fillText(options.label, endPixel + offset, chartArea.top + 12);
    }
    ctx.restore();
  },
};
