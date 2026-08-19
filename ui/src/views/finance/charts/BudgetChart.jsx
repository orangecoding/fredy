/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Bar } from 'react-chartjs-2';

import {
  CHART_COLORS,
  baseChartOptions,
  formatEuro,
  formatEuroCompact,
  registerFinanceCharts,
  withAlpha,
} from '../../../components/cards/chartTheme.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

registerFinanceCharts();

/**
 * Draws the 35 % ceiling across the income bar.
 *
 * The rule is the whole point of the chart, so it is a line on the bar rather than a number
 * in the caption: you can see at a glance whether the housing block crosses it.
 *
 * @type {import('chart.js').Plugin}
 */
const ruleMarkerPlugin = {
  id: 'ruleMarker',
  afterDatasetsDraw(chart, _args, options) {
    const value = options?.value;
    if (!value || value <= 0) {
      return;
    }
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.x) {
      return;
    }
    const x = scales.x.getPixelForValue(value);
    if (!Number.isFinite(x)) {
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = CHART_COLORS.TEXT;
    ctx.lineWidth = 1.5;
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();

    if (options.label) {
      ctx.setLineDash([]);
      ctx.fillStyle = CHART_COLORS.TEXT;
      ctx.font = `11px ${CHART_COLORS.FONT_UI}`;
      const alignRight = x > chartArea.left + (chartArea.right - chartArea.left) * 0.6;
      ctx.textAlign = alignRight ? 'right' : 'left';
      ctx.fillText(options.label, x + (alignRight ? -6 : 6), chartArea.top + 10);
    }
    ctx.restore();
  },
};

/**
 * Where the monthly net income goes, and whether the housing rate fits under the 35 % rule.
 *
 * @param {Object} props
 * @param {Object} props.budget Result of computeBudget.
 * @param {number} props.monthlyRate The housing cost being considered.
 * @param {string} [props.rateLabel] What to call that cost in the legend and tooltip. Defaults to
 *   the mortgage wording; the renting side passes the warm rent instead, because "Baufinanzierung"
 *   on a rental chart describes something the user is not doing.
 * @param {number} [props.height=150]
 */
export default function BudgetChart({ budget, monthlyRate = 0, rateLabel, height = 150 }) {
  const t = useTranslation();
  const locale = useLocale();

  if (budget == null || budget.netIncome <= 0) {
    return <div className="chartCard__no__data">{t('finance.chart.noIncomeData')}</div>;
  }

  const buffer = Math.max(0, budget.netIncome - budget.livingCosts - budget.existingDebtRate - monthlyRate);
  const overspend = Math.max(0, budget.livingCosts + budget.existingDebtRate + monthlyRate - budget.netIncome);

  // Debt service is stacked first, on purpose. The 35 % marker is drawn as a distance from
  // zero, so only a stack that starts with exactly what the rule measures - the mortgage plus
  // any existing debt - puts the marker in a meaningful place. Leading with living costs would
  // push the mortgage block past the line even for a household well inside the rule.
  const segments = [
    [t('finance.budget.existingDebt'), budget.existingDebtRate, withAlpha(CHART_COLORS.PURPLE, 0.85)],
    [rateLabel ?? t('finance.budget.mortgageRate'), monthlyRate, withAlpha(CHART_COLORS.ACCENT, 0.9)],
    [t('finance.budget.livingCosts'), budget.livingCosts, withAlpha(CHART_COLORS.MUTED, 0.75)],
    [t('finance.budget.buffer'), buffer, withAlpha(CHART_COLORS.SUCCESS, 0.5)],
    [t('finance.budget.overspend'), overspend, withAlpha(CHART_COLORS.ERROR, 0.9)],
  ].filter(([, value]) => value > 0);

  const data = {
    labels: [''],
    datasets: segments.map(([label, value, color]) => ({
      label,
      data: [value],
      backgroundColor: color,
      borderRadius: 2,
      barThickness: 44,
      stack: 'income',
    })),
  };

  const base = baseChartOptions({ locale, legend: true });
  const options = {
    ...base,
    indexAxis: 'y',
    plugins: {
      ...base.plugins,
      ruleMarker: {
        value: budget.ruleCap,
        label: t('finance.budget.ruleMarker'),
      },
      tooltip: {
        ...base.plugins.tooltip,
        callbacks: {
          title: () => t('finance.budget.title'),
          label: (item) => {
            const share = ((item.parsed.x / budget.netIncome) * 100).toFixed(0);
            return `${item.dataset.label}: ${formatEuro(item.parsed.x, locale)} (${share} %)`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: CHART_COLORS.GRID },
        border: { display: false },
        ticks: {
          color: CHART_COLORS.MUTED,
          font: { family: CHART_COLORS.FONT_MONO, size: 11 },
          callback: (value) => formatEuroCompact(value, locale),
        },
      },
      y: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { display: false } },
    },
  };

  return (
    <div style={{ height }}>
      <Bar data={data} options={options} plugins={[ruleMarkerPlugin]} />
    </div>
  );
}

BudgetChart.displayName = 'BudgetChart';
