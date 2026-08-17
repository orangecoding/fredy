/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Scatter } from 'react-chartjs-2';
import { useNavigate } from 'react-router';

import {
  CHART_COLORS,
  VERDICT_COLORS,
  baseChartOptions,
  formatEuro,
  formatEuroCompact,
  registerFinanceCharts,
  withAlpha,
} from '../../../components/cards/chartTheme.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

registerFinanceCharts();

/**
 * Every listing you can see, priced against your finances.
 *
 * X is the asking price, Y is how many years it would take to pay off, and the colour is the
 * verdict. This is the issue's original ask: seeing, for every house in the database, how
 * long you would be paying and whether buying it is possible at all. Clicking a point opens
 * that listing.
 *
 * @param {Object} props
 * @param {Array} props.items Scored listings from POST /api/finance/affordability.
 * @param {number} [props.height=340]
 */
export default function AffordabilityScatter({ items = [], height = 340 }) {
  const t = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();

  const { datasets, points } = React.useMemo(() => {
    const byVerdict = { affordable: [], stretch: [], unaffordable: [] };
    const flat = [];

    // Plot the term at the household's own affordable rate, not at the scenario's Tilgung:
    // the latter is identical for every listing (annuity terms do not depend on loan size), so
    // it would draw every point on one flat line and answer nothing.
    const ceiling = Math.max(50, ...items.map((item) => item.payoffYearsAtBudget ?? 0)) + 5;

    for (const item of items) {
      // A rate that never covers the interest has no term. Park those above everything else so
      // they stay on the chart as "off the scale" rather than silently disappearing.
      const years = item.payoffYearsAtBudget ?? ceiling;
      const point = { x: item.price, y: years, item };
      byVerdict[item.verdict]?.push(point);
      flat.push(point);
    }

    const sets = Object.entries(byVerdict)
      .filter(([, values]) => values.length > 0)
      .map(([verdict, values]) => ({
        label: t(`finance.verdict.${verdict}`),
        data: values,
        backgroundColor: withAlpha(VERDICT_COLORS[verdict], 0.65),
        borderColor: VERDICT_COLORS[verdict],
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 8,
      }));

    return { datasets: sets, points: flat };
  }, [items, t]);

  const options = React.useMemo(() => {
    const base = baseChartOptions({ locale, legend: true });
    return {
      ...base,
      interaction: { mode: 'nearest', intersect: true },
      onClick: (_event, elements) => {
        const element = elements?.[0];
        if (!element) {
          return;
        }
        const point = datasets[element.datasetIndex]?.data?.[element.index];
        if (point?.item?.id) {
          navigate(`/listings/listing/${point.item.id}`);
        }
      },
      onHover: (event, elements) => {
        if (event?.native?.target) {
          event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
        }
      },
      plugins: {
        ...base.plugins,
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            title: (contexts) => contexts[0]?.raw?.item?.title || t('finance.scatter.untitled'),
            label: (context) => {
              const { item } = context.raw;
              const lines = [
                `${t('finance.scatter.price')}: ${formatEuro(item.price, locale)}`,
                `${t('finance.scatter.monthlyRate')}: ${formatEuro(item.monthlyPayment, locale)}`,
              ];
              lines.push(
                item.payoffYearsAtBudget == null
                  ? t('finance.scatter.neverPaysOff')
                  : `${t('finance.scatter.payoff')}: ${item.payoffYearsAtBudget} ${t('finance.scatter.years')}`,
              );
              lines.push(`${t('finance.scatter.verdict')}: ${t(`finance.verdict.${item.verdict}`)}`);
              return lines;
            },
            footer: () => t('finance.scatter.clickHint'),
          },
        },
      },
      scales: {
        x: {
          ...base.scales.x,
          grid: { color: CHART_COLORS.GRID },
          ticks: {
            ...base.scales.x.ticks,
            font: { family: CHART_COLORS.FONT_MONO, size: 11 },
            callback: (value) => formatEuroCompact(value, locale),
          },
          title: { display: true, text: t('finance.scatter.axisPrice'), color: CHART_COLORS.MUTED, font: { size: 11 } },
        },
        y: {
          ...base.scales.y,
          ticks: { ...base.scales.y.ticks, callback: (value) => `${value}` },
          title: { display: true, text: t('finance.scatter.axisYears'), color: CHART_COLORS.MUTED, font: { size: 11 } },
        },
      },
    };
  }, [locale, datasets, navigate, t]);

  if (points.length === 0) {
    return <div className="chartCard__no__data">{t('finance.scatter.empty')}</div>;
  }

  return (
    <div style={{ height }}>
      <Scatter data={{ datasets }} options={options} />
    </div>
  );
}

AffordabilityScatter.displayName = 'AffordabilityScatter';
