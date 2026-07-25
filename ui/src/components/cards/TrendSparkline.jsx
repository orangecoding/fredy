/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Line } from 'react-chartjs-2';

import { CHART_COLORS, makeAreaGradient, registerFinanceCharts, withAlpha } from './chartTheme.js';

registerFinanceCharts();

/**
 * How many listings came in per day, as a bare sparkline.
 *
 * No axes, no grid, no legend: at this size those would cost more room than the shape is worth,
 * and the exact figures live in the KPI beside it. The only interactive part is the tooltip,
 * which names the day, because "when was that spike" is the one question the shape provokes.
 *
 * @param {Object} props
 * @param {Array<{date: string, count: number}>} props.data Oldest first.
 * @param {string} [props.locale]
 * @param {number} [props.height=44]
 */
export default function TrendSparkline({ data = [], locale = 'de-DE', height = 44 }) {
  const rows = React.useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const chartData = React.useMemo(
    () => ({
      labels: rows.map((row) => row.date),
      datasets: [
        {
          data: rows.map((row) => Number(row.count) || 0),
          borderColor: CHART_COLORS.ACCENT,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHoverBackgroundColor: CHART_COLORS.ACCENT,
          tension: 0.35,
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
      // The dashboard reloads on every visit; replaying a draw-on animation each time turns a
      // background statistic into something that demands attention.
      animation: false,
      layout: { padding: 0 },
      scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) => new Date(items[0].label).toLocaleDateString(locale),
            label: (ctx) => `${ctx.parsed.y}`,
          },
        },
      },
      interaction: { mode: 'index', intersect: false },
    }),
    [locale],
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <div style={{ height }}>
      <Line data={chartData} options={options} />
    </div>
  );
}

TrendSparkline.displayName = 'TrendSparkline';
