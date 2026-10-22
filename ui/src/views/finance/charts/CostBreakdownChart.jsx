/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Doughnut } from 'react-chartjs-2';

import {
  CHART_COLORS,
  baseChartOptions,
  formatEuro,
  registerFinanceCharts,
  shareRamp,
} from '../../../components/cards/chartTheme.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

registerFinanceCharts();

/**
 * One step of the greyscale ramp per cost type, so a slice keeps its meaning between renders.
 *
 * Shares of one sum, so the ramp the dashboard uses for shares: the steps differ in lightness
 * rather than hue, the purchase price is the brightest and the costs on top of it step down.
 *
 * Resolved per call rather than frozen into a constant: the ramp is made of theme tokens, and a
 * list captured at import time would still be the dark one after a switch to light.
 *
 * @returns {string[]}
 */
function sliceColors() {
  return shareRamp();
}

/**
 * Write the total into the hole of the doughnut.
 *
 * Drawn on the canvas rather than positioned over it with CSS: the ring's centre moves as the
 * legend reflows, so any fixed offset would drift off-centre at some widths. The arc knows
 * exactly where its middle is, so ask it.
 *
 * @type {import('chart.js').Plugin}
 */
const centerTotalPlugin = {
  id: 'centerTotal',
  afterDatasetsDraw(chart, _args, options) {
    const arc = chart.getDatasetMeta(0)?.data?.[0];
    if (arc == null || !options?.value) {
      return;
    }
    const { ctx } = chart;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = CHART_COLORS.MUTED;
    ctx.font = `12px ${CHART_COLORS.FONT_UI}`;
    ctx.fillText(String(options.label ?? ''), arc.x, arc.y - 12);

    ctx.fillStyle = CHART_COLORS.TEXT;
    ctx.font = `600 16px ${CHART_COLORS.FONT_UI}`;
    ctx.fillText(options.value, arc.x, arc.y + 8);
    ctx.restore();
  },
};

/**
 * What the house really costs: price, the three Kaufnebenkosten, and the interest on top.
 *
 * The centre carries the total, because that single number - not the asking price - is what
 * the purchase actually comes to.
 *
 * @param {Object} props
 * @param {Object} props.financing Result of calculateFinancing.
 * @param {number} [props.height=280]
 */
export default function CostBreakdownChart({ financing, height = 280 }) {
  const t = useTranslation();
  const locale = useLocale();

  const { labels, values, total } = React.useMemo(() => {
    if (financing == null || financing.purchasePrice <= 0) {
      return { labels: [], values: [], total: 0 };
    }
    const costs = financing.closingCosts;
    const interest = financing.primary?.totalInterest ?? 0;
    const entries = [
      [t('finance.cost.purchasePrice'), financing.purchasePrice],
      [t('finance.cost.grunderwerbsteuer'), costs.grunderwerbsteuer],
      [t('finance.cost.notar'), costs.notar],
      [t('finance.cost.makler'), costs.makler],
      [t('finance.cost.interest'), interest],
    ].filter(([, value]) => value > 0);

    return {
      labels: entries.map(([label]) => label),
      values: entries.map(([, value]) => value),
      total: entries.reduce((sum, [, value]) => sum + value, 0),
    };
  }, [financing, t]);

  const options = React.useMemo(() => {
    const base = baseChartOptions({ locale, legend: true });
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { ...base.plugins.legend, position: 'right', align: 'center' },
        centerTotal: { label: t('finance.cost.totalOutlay'), value: formatEuro(total, locale) },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            label: (item) => {
              const share = total > 0 ? ((item.parsed / total) * 100).toFixed(1) : '0';
              return `${item.label}: ${formatEuro(item.parsed, locale)} (${share} %)`;
            },
          },
        },
      },
    };
  }, [locale, total, t]);

  if (labels.length === 0) {
    return <div className="chartCard__no__data">{t('finance.chart.noData')}</div>;
  }

  const slices = sliceColors();
  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: labels.map((_, index) => slices[index % slices.length]),
        // Gaps between the slices instead of an outline in a surface colour, which drew a ring
        // around each one now that the chart sits on the page rather than on a card.
        borderWidth: 0,
        spacing: 2,
        hoverOffset: 4,
      },
    ],
  };

  return (
    <div style={{ height }}>
      <Doughnut data={data} options={options} plugins={[centerTotalPlugin]} />
    </div>
  );
}

CostBreakdownChart.displayName = 'CostBreakdownChart';
