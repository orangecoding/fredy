/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Bar } from 'react-chartjs-2';

import { CHART_PALETTE, CHART_COLORS, baseChartOptions, registerFinanceCharts, withAlpha } from './chartTheme.js';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';

import './ChartCard.less';
import './ProviderShareChart.less';

registerFinanceCharts();

/**
 * Normalise the two shapes this chart can be handed into one list of rows.
 *
 * `/api/dashboard` sends parallel `labels`/`values` arrays, while
 * `getProviderDistributionForJobIds` returns `{type, value}` rows. Accepting only one of them
 * silently renders an empty state for real data, which is exactly what happened here.
 *
 * @param {{labels?: string[], values?: number[]}|Array<{type?: string, value?: number}>|null} data
 * @returns {Array<{label: string, value: number}>}
 */
function toRows(data) {
  if (Array.isArray(data)) {
    return data.map((row) => ({ label: row?.type ?? '', value: row?.value }));
  }
  if (data && typeof data === 'object' && Array.isArray(data.labels)) {
    const values = Array.isArray(data.values) ? data.values : [];
    return data.labels.map((label, index) => ({ label: label ?? '', value: values[index] }));
  }
  return [];
}

/** One bar, full width, split by provider. Just tall enough to read the segments. */
const BAR_HEIGHT = 28;

/**
 * Which share of the listings each provider brought in.
 *
 * Drawn as a single stacked bar rather than a pie: the question is "how do these compare", and
 * a length along one axis answers that far more precisely than the angle of a wedge. It also
 * degenerates gracefully - one provider fills the bar and still reads as 100 %, where a pie
 * becomes a featureless circle.
 *
 * @param {Object} props
 * @param {{labels: string[], values: number[]}|Array<{type: string, value: number}>} props.data
 *   Percentages per provider. `/api/dashboard` sends the parallel-arrays form; the storage layer
 *   produces the row form, so both are accepted rather than betting on one.
 * @param {number} [props.totalListings] Used to phrase the single-provider case concretely.
 */
export default function ProviderShareChart({ data = [], totalListings = 0 }) {
  const t = useTranslation();
  const locale = useLocale();

  const segments = React.useMemo(() => {
    const rows = toRows(data);
    // Filtering on the percentage would erase a real provider: the backend rounds to whole
    // percent, so one listing in a few hundred comes back as 0 and the provider vanished from
    // both the bar and the legend. The distribution is a GROUP BY, so every row it returns has
    // at least one listing - being in the list is what qualifies, not the rounded share.
    return rows
      .map((row) => ({ label: row.label, value: Number(row.value) }))
      .filter((row) => row.label && Number.isFinite(row.value) && row.value >= 0)
      .sort((a, b) => b.value - a.value)
      .map((row, index) => ({ ...row, color: CHART_PALETTE[index % CHART_PALETTE.length] }));
  }, [data]);

  const chartData = React.useMemo(
    () => ({
      labels: [''],
      datasets: segments.map((segment) => ({
        label: segment.label,
        data: [segment.value],
        // Muted rather than full strength: this is a background statistic, and a full-width bar
        // at full saturation shouted louder than the KPIs above it.
        backgroundColor: withAlpha(segment.color, 0.62),
        borderColor: segment.color,
        borderWidth: 0,
        borderRadius: 3,
        borderSkipped: false,
        barThickness: 14,
        stack: 'providers',
      })),
    }),
    [segments],
  );

  const options = React.useMemo(() => {
    const base = baseChartOptions({ locale, legend: false });
    return {
      ...base,
      indexAxis: 'y',
      // chart.js grows the bars in on every mount by default, so the bar replayed a little
      // performance on each page load. A standing statistic should just be there.
      animation: false,
      // The shared base uses `{ mode: 'index', intersect: false }`, which is right for the trend
      // charts: many points along one axis, one series. This chart is the opposite shape - a
      // single index carrying one dataset per provider - and index mode resolves the hovered
      // *index*, which is always 0 here. It therefore reported the first provider no matter which
      // segment the cursor was over. Hit-testing the element under the cursor is what this bar
      // actually needs.
      interaction: { mode: 'nearest', axis: 'x', intersect: true },
      layout: { padding: { top: 4, bottom: 4 } },
      scales: {
        x: { stacked: true, min: 0, max: 100, display: false, grid: { display: false } },
        y: { stacked: true, display: false, grid: { display: false } },
      },
      plugins: {
        ...base.plugins,
        legend: { display: false },
        tooltip: {
          ...base.plugins?.tooltip,
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${ctx.parsed.x < 1 ? t('dashboard.providerBelowOnePercent') : `${ctx.parsed.x} %`}`,
          },
        },
      },
    };
  }, [locale, t]);

  if (segments.length === 0) {
    return <div className="chartCard__no__data">{t('dashboard.noData')}</div>;
  }

  // A bar that is 100 % one colour is a rectangle, not a comparison. With a single provider the
  // sentence carries the same information and takes a fraction of the room.
  if (segments.length === 1) {
    return (
      <p className="providerShare__single">
        <span className="providerShare__swatch" style={{ backgroundColor: segments[0].color }} aria-hidden="true" />
        {t('dashboard.providerSingle', {
          provider: segments[0].label,
          count: String(totalListings || 0),
        })}
      </p>
    );
  }

  return (
    <div className="providerShare">
      <div className="providerShare__bar" style={{ height: BAR_HEIGHT }}>
        <Bar data={chartData} options={options} />
      </div>

      {/* The legend is a list rather than chart.js's own, so each provider can carry its share as
          a figure. Reading a percentage beats estimating one off a bar. */}
      <ul className="providerShare__legend">
        {segments.map((segment) => (
          <li className="providerShare__item" key={segment.label}>
            <span className="providerShare__swatch" style={{ backgroundColor: segment.color }} aria-hidden="true" />
            <span className="providerShare__name">{segment.label}</span>
            {/* A provider that rounds to zero still found something, so "0 %" would read as a
                bug. "<1 %" says the share is tiny without claiming it is nothing. */}
            <span className="providerShare__value" style={{ color: CHART_COLORS.TEXT }}>
              {segment.value < 1 ? t('dashboard.providerBelowOnePercent') : `${segment.value} %`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

ProviderShareChart.displayName = 'ProviderShareChart';
