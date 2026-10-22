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
  registerFinanceCharts,
  withAlpha,
  zinsbindungBandPlugin,
} from '../../../components/cards/chartTheme.js';
import { scenarioColors } from './scenarioColors.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

registerFinanceCharts();

/**
 * Remaining debt over time, one line per interest scenario.
 *
 * The primary scenario is the brightest line, over a flat wash; the alternatives are thinner
 * comparison lines a step further down the greyscale ramp, the same colours as their swatches in
 * the scenario form. The Zinsbindung is drawn as a shaded band ending in a dashed marker, because the
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

    const perScenario = usable.map((scenario) => scenario.schedule.years ?? []);
    const longest = Math.max(...perScenario.map((years) => years.length));
    const yearLabels = Array.from({ length: longest }, (_, index) => `${index + 1}`);

    const palette = scenarioColors();
    const sets = usable.map((scenario, index) => {
      const color = palette[index % palette.length];
      const isPrimary = index === 0;
      const years = perScenario[index];

      return {
        label: scenario.label || `${scenario.annualRate} %`,
        // Start each line at the full loan (year 0) so the curve leaves the y-axis at the
        // amount actually borrowed rather than after twelve instalments.
        data: yearLabels.map((_, yearIndex) => years[yearIndex]?.balance ?? null),
        borderColor: color,
        borderWidth: isPrimary ? 2.5 : 2,
        // Past the end of the ramp a grey comes round again; the dash keeps the two lines apart.
        borderDash: index >= palette.length ? [6, 4] : [],
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: color,
        tension: 0.25,
        spanGaps: false,
        // A flat wash under the primary line, no gradient: it marks which curve the figures
        // are read from without drawing a glow under it.
        fill: isPrimary ? 'origin' : false,
        backgroundColor: withAlpha(color, isPrimary ? 0.08 : 0),
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
          title: { display: true, text: t('finance.chart.axisYears'), color: CHART_COLORS.MUTED, font: { size: 11 } },
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
