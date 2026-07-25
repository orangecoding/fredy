/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Line } from 'react-chartjs-2';

import {
  CHART_COLORS,
  baseChartOptions,
  formatEuro,
  makeAreaGradient,
  registerFinanceCharts,
  zinsbindungBandPlugin,
} from '../../../components/cards/chartTheme.js';
import { aggregateByYear } from '../../../../../lib/services/finance/amortization.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

registerFinanceCharts();

/**
 * A compact single-scenario version of the debt trajectory, for the listing detail page.
 *
 * Same theme and the same Zinsbindung band as the full chart on /finance, so a listing and
 * the calculator read as one system rather than two separate tools. The x-axis is labelled
 * in calendar years here, because on a detail page the question is "when", not "after how
 * many years".
 *
 * @param {Object} props
 * @param {Object} props.scenario A scenario from calculateFinancing.
 * @param {number} [props.currentAge]
 * @param {number} [props.height=220]
 */
export default function ListingPayoffChart({ scenario, currentAge = null, height = 220 }) {
  const t = useTranslation();
  const locale = useLocale();
  const startYear = React.useMemo(() => new Date().getFullYear(), []);

  const years = React.useMemo(
    () => (scenario?.schedule?.months?.length > 0 ? aggregateByYear(scenario.schedule.months) : []),
    [scenario],
  );

  const data = React.useMemo(
    () => ({
      labels: years.map((year) => `${startYear + year.year}`),
      datasets: [
        {
          label: t('finance.chart.remainingDebt'),
          data: years.map((year) => year.balance),
          borderColor: CHART_COLORS.ACCENT,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: CHART_COLORS.ACCENT,
          tension: 0.25,
          fill: 'origin',
          backgroundColor: (context) =>
            makeAreaGradient(context.chart.ctx, context.chart.chartArea, CHART_COLORS.ACCENT),
        },
      ],
    }),
    [years, startYear, t],
  );

  const options = React.useMemo(() => {
    const base = baseChartOptions({ locale, legend: false });
    return {
      ...base,
      plugins: {
        ...base.plugins,
        zinsbindungBand: {
          endYear: scenario?.fixedYears ?? 0,
          label: t('finance.chart.zinsbindungShort'),
        },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            title: (items) => {
              const calendarYear = Number(items[0]?.label);
              if (currentAge == null) {
                return `${calendarYear}`;
              }
              return t('finance.chart.calendarYearWithAge', {
                year: String(calendarYear),
                age: String(currentAge + (calendarYear - startYear)),
              });
            },
            label: (item) => `${t('finance.chart.remainingDebt')}: ${formatEuro(item.parsed.y, locale)}`,
          },
        },
      },
    };
  }, [locale, scenario, currentAge, startYear, t]);

  if (years.length === 0) {
    return null;
  }

  return (
    <div style={{ height }}>
      <Line data={data} options={options} plugins={[zinsbindungBandPlugin]} />
    </div>
  );
}

ListingPayoffChart.displayName = 'ListingPayoffChart';
