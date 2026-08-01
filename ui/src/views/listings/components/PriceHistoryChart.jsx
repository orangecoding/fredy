/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Line } from 'react-chartjs-2';

import {
  CHART_COLORS,
  formatEuro,
  makeAreaGradient,
  registerFinanceCharts,
  withAlpha,
} from '../../../components/cards/chartTheme.js';

registerFinanceCharts();

/**
 * How a listing's price developed, as a small line chart.
 *
 * Stepped rather than smoothed: a price does not drift, it is changed once and then holds until it
 * is changed again. A curve between two readings would draw prices the listing never had, on the
 * one chart somebody might use to argue about what a flat used to cost.
 *
 * Renders nothing below two points. A single dot is not a history, and an axis-less chart showing
 * one dot reads as a rendering failure rather than as "no changes yet".
 *
 * @param {Object} props
 * @param {Array<{price: number, observed_at: number}>} props.data Oldest first.
 * @param {string} [props.locale]
 * @param {number} [props.height=120]
 * @returns {React.ReactElement|null}
 */
export default function PriceHistoryChart({ data = [], locale = 'de-DE', height = 120 }) {
  const rows = React.useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const chartData = React.useMemo(
    () => ({
      labels: rows.map((row) => Number(row.observed_at)),
      datasets: [
        {
          data: rows.map((row) => Number(row.price) || 0),
          borderColor: CHART_COLORS.ACCENT,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: CHART_COLORS.ACCENT,
          stepped: 'after',
          fill: true,
          backgroundColor: (ctx) => {
            const { chart } = ctx;
            if (!chart.chartArea) {
              return withAlpha(CHART_COLORS.ACCENT, 0.15);
            }
            return makeAreaGradient(chart.ctx, chart.chartArea, CHART_COLORS.ACCENT, 0.28);
          },
        },
      ],
    }),
    [rows],
  );

  const options = React.useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: 0 },
      scales: {
        x: { display: false },
        // Not beginAtZero: a rent moving from 1200 to 1150 is a visible step on its own scale and an
        // invisible one on a scale that starts at zero, which is the whole reason to draw this.
        y: {
          display: true,
          beginAtZero: false,
          grid: { color: CHART_COLORS.GRID },
          ticks: {
            color: CHART_COLORS.MUTED,
            maxTicksLimit: 4,
            callback: (value) => formatEuro(value, locale),
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) => new Date(Number(items[0].label)).toLocaleDateString(locale),
            label: (ctx) => formatEuro(ctx.parsed.y, locale),
          },
        },
      },
      interaction: { mode: 'index', intersect: false },
    }),
    [locale],
  );

  if (rows.length < 2) {
    return null;
  }

  return (
    <div style={{ height }}>
      <Line data={chartData} options={options} />
    </div>
  );
}

PriceHistoryChart.displayName = 'PriceHistoryChart';
