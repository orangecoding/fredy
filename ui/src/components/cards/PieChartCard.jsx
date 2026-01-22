/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title as ChartTitle } from 'chart.js';

import './ChartCard.less';

ChartJS.register(ArcElement, Tooltip, Legend, ChartTitle);

export default function PieChartCard({ data = [] }) {
  const { labels, values } = React.useMemo(() => {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const lbls = Array.isArray(data.labels) ? data.labels : [];
      const vals = Array.isArray(data.values)
        ? data.values.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0))
        : [];
      return { labels: lbls, values: vals };
    }
    if (Array.isArray(data)) {
      const lbls = data.map((d) => d?.type ?? 'Unknown');
      const vals = data.map((d) => {
        const v = Number(d?.value);
        return Number.isFinite(v) ? v : 0;
      });
      return { labels: lbls, values: vals };
    }
    return { labels: [], values: [] };
  }, [data]);

  const palette = React.useMemo(
    () => [
      '#4e79a7',
      '#f28e2b',
      '#e15759',
      '#76b7b2',
      '#59a14f',
      '#edc948',
      '#b07aa1',
      '#ff9da7',
      '#9c755f',
      '#bab0ab',
    ],
    [],
  );

  const chartData = React.useMemo(
    () => ({
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: labels.map((_, i) => palette[i % palette.length]),
          borderColor: labels.map((_, i) => palette[i % palette.length]),
          borderWidth: 1,
        },
      ],
    }),
    [labels, values, palette],
  );

  const options = React.useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            color: () => '#fff',
          },
        },
        title: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const label = ctx.label || '';
              const val = ctx.parsed !== undefined ? ctx.parsed : ctx.raw;
              return `${label}: ${val}%`;
            },
          },
        },
      },
    }),
    [],
  );

  const isEmpty = !labels || labels.length === 0 || !values || values.length === 0;

  return (
    <>{isEmpty ? <div className="chartCard__no__data">No Data</div> : <Pie data={chartData} options={options} />}</>
  );
}
