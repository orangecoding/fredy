/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Line } from 'react-chartjs-2';

import {
  CHART_PALETTE,
  baseChartOptions,
  formatEuro,
  makeAreaGradient,
  registerFinanceCharts,
  withAlpha,
  zinsbindungBandPlugin,
} from '../../../components/cards/chartTheme.js';
import { aggregateByYear } from '../../../../../lib/services/finance/amortization.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

registerFinanceCharts();

/**
 * Remaining debt over time, one line per interest scenario.
 *
 * The primary scenario is filled and accent-coloured; the alternatives are thin comparison
 * lines. The Zinsbindung is drawn as a shaded band ending in a dashed marker, because the
 * Restschuld at that edge - not the final payoff date - is what a German buyer has to
 * refinance and therefore the most consequential number on the chart.
 *
 * @param {Object} props
 * @param {Array} props.scenarios Scenarios from calculateFinancing.
 * @param {number} [props.currentAge] Age today, used to annotate the tooltip.
 * @param {number} [props.height=320]
 */
export default function DebtTrajectoryChart({ scenarios = [], currentAge = null, height = 320 }) {
  const t = useTranslation();
  const locale = useLocale();

  const { labels, datasets, fixedYears } = React.useMemo(() => {
    const usable = scenarios.filter((scenario) => scenario?.schedule?.months?.length > 0);
    if (usable.length === 0) {
      return { labels: [], datasets: [], fixedYears: 0 };
    }

    const perScenario = usable.map((scenario) => aggregateByYear(scenario.schedule.months));
    const longest = Math.max(...perScenario.map((years) => years.length));
    const yearLabels = Array.from({ length: longest }, (_, index) => `${index + 1}`);

    const sets = usable.map((scenario, index) => {
      const color = CHART_PALETTE[index % CHART_PALETTE.length];
      const isPrimary = index === 0;
      const years = perScenario[index];

      return {
        label: scenario.label || `${scenario.annualRate} %`,
        // Start each line at the full loan (year 0) so the curve leaves the y-axis at the
        // amount actually borrowed rather than after twelve instalments.
        data: yearLabels.map((_, yearIndex) => years[yearIndex]?.balance ?? null),
        borderColor: color,
        borderWidth: isPrimary ? 2.5 : 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: color,
        tension: 0.25,
        spanGaps: false,
        fill: isPrimary ? 'origin' : false,
        backgroundColor: isPrimary
          ? (context) => makeAreaGradient(context.chart.ctx, context.chart.chartArea, color)
          : withAlpha(color, 0),
      };
    });

    return { labels: yearLabels, datasets: sets, fixedYears: usable[0].fixedYears ?? 0 };
  }, [scenarios]);

  const options = React.useMemo(() => {
    const base = baseChartOptions({ locale, legend: datasets.length > 1 });
    return {
      ...base,
      plugins: {
        ...base.plugins,
        zinsbindungBand: {
          endYear: fixedYears,
          label: t('finance.chart.zinsbindungEnds', { years: String(fixedYears) }),
        },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            title: (items) => {
              const year = Number(items[0]?.label);
              if (currentAge == null) {
                return t('finance.chart.yearLabel', { year: String(year) });
              }
              return t('finance.chart.yearLabelWithAge', { year: String(year), age: String(currentAge + year) });
            },
            label: (item) => `${item.dataset.label}: ${formatEuro(item.parsed.y, locale)}`,
          },
        },
      },
      scales: {
        ...base.scales,
        x: {
          ...base.scales.x,
          title: { display: true, text: t('finance.chart.axisYears'), color: '#909090', font: { size: 11 } },
        },
      },
    };
  }, [locale, datasets.length, fixedYears, currentAge, t]);

  if (datasets.length === 0) {
    return <div className="chartCard__no__data">{t('finance.chart.noData')}</div>;
  }

  return (
    <div style={{ height }}>
      <Line data={{ labels, datasets }} options={options} plugins={[zinsbindungBandPlugin]} />
    </div>
  );
}

DebtTrajectoryChart.displayName = 'DebtTrajectoryChart';
