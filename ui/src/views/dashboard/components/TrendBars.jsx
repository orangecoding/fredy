/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Bar } from 'react-chartjs-2';

import { CHART_COLORS, registerFinanceCharts } from '../../../components/cards/chartTheme.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

registerFinanceCharts();

/** The current week is the last seven of the fourteen days, and is the half drawn in the accent. */
const CURRENT_WEEK_DAYS = 7;

/**
 * How many listings came in on each of the last fourteen days, one bar per day.
 *
 * This replaced a smoothed sparkline, which had three problems a daily count cannot afford: the
 * curve interpolated values between whole-day figures that never existed, there was no zero line
 * to read a bar against, and the heading spoke of seven days while the line showed fourteen. Bars
 * say "one day, this many" and nothing else.
 *
 * The two weeks are told apart by position as well as colour - the previous week is simply the
 * left half - so the split survives for a reader who cannot see the difference between grey and
 * red. The legend underneath names both halves with their totals.
 *
 * @param {Object} props
 * @param {Array<{date: string, count: number}>} props.data Oldest first, fourteen entries.
 * @param {number} props.previousWeek Total of the older seven days.
 * @param {number} props.thisWeek Total of the most recent seven days.
 * @param {string} [props.locale]
 * @returns {React.ReactElement|null}
 */
export default function TrendBars({ data = [], previousWeek = 0, thisWeek = 0, locale = 'de-DE' }) {
  const t = useTranslation();
  const rows = React.useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const chartData = React.useMemo(
    () => ({
      labels: rows.map((row) => row.date),
      datasets: [
        {
          data: rows.map((row) => Number(row.count) || 0),
          backgroundColor: rows.map((_row, index) =>
            index < rows.length - CURRENT_WEEK_DAYS ? CHART_COLORS.MUTED : CHART_COLORS.ACCENT,
          ),
          borderRadius: 3,
          categoryPercentage: 0.78,
          barPercentage: 0.94,
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
            // The label is a local calendar day ("YYYY-MM-DD"). `new Date()` reads that form as
            // UTC midnight, which is the previous day anywhere west of UTC.
            title: (items) => {
              const [year, month, day] = String(items[0].label).split('-').map(Number);
              return new Date(year, month - 1, day).toLocaleDateString(locale);
            },
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
    <>
      {/* A canvas carries no text, so to a screen reader the chart is an empty box. The label on
          the wrapper is the whole of what it says. */}
      <div
        className="dashboard__trend"
        role="img"
        aria-label={t('dashboard.trendAria', { previous: String(previousWeek), current: String(thisWeek) })}
      >
        <Bar data={chartData} options={options} />
      </div>
      <div className="dashboard__trendLegend">
        <span className="dashboard__trendKey">
          <span className="dashboard__trendSwatch" />
          {t('dashboard.trendPreviousWeek', { count: String(previousWeek) })}
        </span>
        <span className="dashboard__trendKey">
          <span className="dashboard__trendSwatch dashboard__trendSwatch--current" />
          {t('dashboard.trendCurrentWeek', { count: String(thisWeek) })}
        </span>
      </div>
    </>
  );
}

TrendBars.displayName = 'TrendBars';
