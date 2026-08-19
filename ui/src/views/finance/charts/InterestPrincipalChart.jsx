/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Bar } from 'react-chartjs-2';

import {
  CHART_COLORS,
  baseChartOptions,
  formatEuro,
  registerFinanceCharts,
  withAlpha,
} from '../../../components/cards/chartTheme.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

registerFinanceCharts();

/**
 * Where each year's payments actually go: interest versus principal.
 *
 * The instalment is flat for the whole term, so this chart is the one that shows why a low
 * Tilgung is expensive - the first years are almost entirely interest.
 *
 * @param {Object} props
 * @param {Object} props.scenario A scenario from calculateFinancing.
 * @param {number} [props.height=280]
 */
export default function InterestPrincipalChart({ scenario, height = 280 }) {
  const t = useTranslation();
  const locale = useLocale();

  const years = React.useMemo(
    () => (scenario?.schedule?.months?.length > 0 ? (scenario.schedule.years ?? []) : []),
    [scenario],
  );

  const data = React.useMemo(
    () => ({
      labels: years.map((year) => `${year.year}`),
      datasets: [
        {
          label: t('finance.chart.interestShare'),
          data: years.map((year) => year.interest),
          backgroundColor: withAlpha(CHART_COLORS.ACCENT, 0.85),
          borderRadius: 2,
          stack: 'payments',
        },
        {
          label: t('finance.chart.principalShare'),
          data: years.map((year) => year.principal),
          backgroundColor: withAlpha(CHART_COLORS.BLUE, 0.85),
          borderRadius: 2,
          stack: 'payments',
        },
      ],
    }),
    [years, t],
  );

  const options = React.useMemo(() => {
    const base = baseChartOptions({ locale, legend: true });
    return {
      ...base,
      plugins: {
        ...base.plugins,
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            title: (items) => t('finance.chart.yearLabel', { year: String(items[0]?.label) }),
            label: (item) => `${item.dataset.label}: ${formatEuro(item.parsed.y, locale)}`,
          },
        },
      },
      scales: {
        ...base.scales,
        x: { ...base.scales.x, stacked: true },
        y: { ...base.scales.y, stacked: true },
      },
    };
  }, [locale, t]);

  if (years.length === 0) {
    return <div className="chartCard__no__data">{t('finance.chart.noData')}</div>;
  }

  return (
    <div style={{ height }}>
      <Bar data={data} options={options} />
    </div>
  );
}

InterestPrincipalChart.displayName = 'InterestPrincipalChart';
