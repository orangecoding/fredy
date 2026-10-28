/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Line } from 'react-chartjs-2';

import { CHART_COLORS, registerFinanceCharts } from '../../../components/cards/chartTheme.js';

import { formatListingPrice } from '../../../services/price/priceService.js';

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
 * A plain line in the text colour, no area under it. A price is a figure like the ones above it,
 * not the page's action, so it does not borrow the red, and a gradient would only add a glow to a
 * chart whose point is the steps.
 *
 * @param {Object} props
 * @param {Array<{price: number, observed_at: number}>} props.data Oldest first.
 * @param {string} [props.locale]
 * @param {number} [props.height=120]
 * @returns {React.ReactElement|null}
 */
export default function PriceHistoryChart({ data = [], locale = 'de-DE', height = 120, currency = 'EUR' }) {
  const rows = React.useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const chartData = React.useMemo(
    () => ({
      labels: rows.map((row) => Number(row.observed_at)),
      datasets: [
        {
          data: rows.map((row) => Number(row.price) || 0),
          borderColor: CHART_COLORS.TEXT,
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: CHART_COLORS.TEXT,
          stepped: 'after',
          fill: false,
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
          border: { display: false },
          ticks: {
            color: CHART_COLORS.MUTED,
            font: { family: CHART_COLORS.FONT_UI, size: 12 },
            maxTicksLimit: 4,
            callback: (value) => formatListingPrice(value, locale, currency),
          },
        },
      },
      plugins: {
        legend: { display: false },
        // The same tooltip as the dashboard's trend chart: a raised surface with a hairline.
        tooltip: {
          displayColors: false,
          backgroundColor: CHART_COLORS.ELEVATED,
          borderColor: CHART_COLORS.GRID_BRIGHT,
          borderWidth: 1,
          titleColor: CHART_COLORS.MUTED,
          bodyColor: CHART_COLORS.TEXT,
          titleFont: { family: CHART_COLORS.FONT_UI, size: 12, weight: '500' },
          bodyFont: { family: CHART_COLORS.FONT_UI, size: 13, weight: '600' },
          callbacks: {
            title: (items) => new Date(Number(items[0].label)).toLocaleDateString(locale),
            label: (ctx) => formatListingPrice(ctx.parsed.y, locale, currency),
          },
        },
      },
      interaction: { mode: 'index', intersect: false },
    }),
    [locale, currency],
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
