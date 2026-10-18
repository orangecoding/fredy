/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Bar } from 'react-chartjs-2';

import { CHART_COLORS, registerFinanceCharts, shareRamp } from '../../../components/cards/chartTheme.js';
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
 * left half, drawn in the middle grey of the ramp (the step that clears 3:1 on the page in both themes) - so the split survives for a reader who cannot
 * see the difference between grey and red. The legend above names both halves with their totals,
 * the axis underneath marks where the fourteen days start, where the current week starts, and today.
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

  const chartData = React.useMemo(() => {
    const previous = shareRamp()[2];
    return {
      labels: rows.map((row) => row.date),
      datasets: [
        {
          data: rows.map((row) => Number(row.count) || 0),
          backgroundColor: rows.map((_row, index) =>
            index < rows.length - CURRENT_WEEK_DAYS ? previous : CHART_COLORS.ACCENT,
          ),
          borderRadius: { topLeft: 2, topRight: 2 },
          borderSkipped: 'bottom',
          categoryPercentage: 0.86,
          barPercentage: 0.92,
        },
      ],
    };
  }, [rows]);

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
          backgroundColor: CHART_COLORS.ELEVATED,
          borderColor: CHART_COLORS.GRID_BRIGHT,
          borderWidth: 1,
          titleColor: CHART_COLORS.MUTED,
          bodyColor: CHART_COLORS.TEXT,
          titleFont: { family: CHART_COLORS.FONT_UI, size: 12, weight: '500' },
          bodyFont: { family: CHART_COLORS.FONT_UI, size: 13, weight: '600' },
          padding: 10,
          cornerRadius: 8,
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

  /** A local calendar day ("YYYY-MM-DD") as a short date, read as local rather than UTC midnight. */
  const shortDate = (value) => {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  };

  return (
    <>
      <div className="dashboard__trendLegend">
        <span className="dashboard__trendKey">
          <span className="dashboard__trendSwatch dashboard__trendSwatch--current" />
          {t('dashboard.trendCurrentWeek', { count: String(thisWeek) })}
        </span>
        <span className="dashboard__trendKey">
          <span className="dashboard__trendSwatch" />
          {t('dashboard.trendPreviousWeek', { count: String(previousWeek) })}
        </span>
      </div>
      {/* A canvas carries no text, so to a screen reader the chart is an empty box. The label on
          the wrapper is the whole of what it says. */}
      <div
        className="dashboard__trend"
        role="img"
        aria-label={t('dashboard.trendAria', { previous: String(previousWeek), current: String(thisWeek) })}
      >
        <Bar data={chartData} options={options} />
      </div>
      <div className="dashboard__trendAxis" aria-hidden="true">
        <span>{shortDate(rows[0].date)}</span>
        {rows.length > CURRENT_WEEK_DAYS && <span>{shortDate(rows[rows.length - CURRENT_WEEK_DAYS].date)}</span>}
        <span>{t('dashboard.trendToday')}</span>
      </div>
    </>
  );
}

TrendBars.displayName = 'TrendBars';
