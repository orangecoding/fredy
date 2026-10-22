/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';

import { shareRamp } from './chartTheme.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';

import './ChartCard.less';
import './ProviderShareChart.less';

/**
 * The provider distribution as rows of `{label, value}`, whichever of its two shapes it arrives in.
 *
 * @param {Array<{type: string, value: number}>|{labels: string[], values: number[]}} data
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

/**
 * Where the listings came from, as one bar split by portal with a legend of exact shares.
 *
 * Drawn in elements rather than on a canvas: a single stacked bar needs no chart library, and as
 * elements it follows the theme through the stylesheet and can be read by assistive technology. The
 * segments take the greyscale ramp in order of size, so the largest portal is the brightest and no
 * colour suggests a category the data does not have.
 *
 * @param {Object} props
 * @param {Array|Object} props.data Percentages per provider, as the dashboard route sends them.
 * @param {number} [props.totalListings] For the sentence that replaces the chart when there is only
 *   one provider.
 * @returns {React.ReactElement}
 */
export default function ProviderShareChart({ data = [], totalListings = 0 }) {
  const t = useTranslation();

  const segments = React.useMemo(() => {
    const ramp = shareRamp();
    // Filtering on the percentage would erase a real provider: the backend rounds to whole
    // percent, so one listing in a few hundred comes back as 0. The distribution is a GROUP BY, so
    // every row it returns has at least one listing - being in the list is what qualifies.
    const rows = toRows(data)
      .map((row) => ({ label: row.label, value: Number(row.value) }))
      .filter((row) => row.label && Number.isFinite(row.value) && row.value >= 0)
      .sort((a, b) => b.value - a.value);
    // The ramp has five greys. Past five portals the smallest ones share the last grey as one
    // "others" segment, so no two segments and no two legend entries look the same.
    const shown =
      rows.length > ramp.length
        ? [
            ...rows.slice(0, ramp.length - 1),
            {
              label: t('dashboard.providerOthers'),
              value: rows.slice(ramp.length - 1).reduce((sum, row) => sum + row.value, 0),
            },
          ]
        : rows;
    return shown.map((row, index) => ({ ...row, color: ramp[index] }));
  }, [data, t]);

  if (segments.length === 0) {
    return <div className="chartCard__no__data">{t('dashboard.noData')}</div>;
  }

  // A bar that is all one portal is a rectangle, not a comparison. The sentence carries the same
  // information in a fraction of the room.
  if (segments.length === 1) {
    return (
      <p className="providerShare__single">
        {t('dashboard.providerSingle', {
          provider: segments[0].label,
          count: String(totalListings || 0),
        })}
      </p>
    );
  }

  // A provider that rounds to zero still found something, so "0 %" would read as a bug. "<1 %"
  // says the share is tiny without claiming it is nothing.
  const share = (value) => (value < 1 ? t('dashboard.providerBelowOnePercent') : `${value} %`);

  return (
    <div className="providerShare">
      <div className="providerShare__bar" aria-hidden="true">
        {segments.map((segment) => (
          <span
            key={segment.label}
            className="providerShare__segment"
            // At least a sliver, so a provider under one percent is still a visible part of the bar.
            style={{ flexGrow: Math.max(segment.value, 0.6), backgroundColor: segment.color }}
          />
        ))}
      </div>

      <ul className="providerShare__legend">
        {segments.map((segment) => (
          <li className="providerShare__item" key={segment.label}>
            <span className="providerShare__swatch" style={{ backgroundColor: segment.color }} aria-hidden="true" />
            <span className="providerShare__name">{segment.label}</span>
            <span className="providerShare__value">{share(segment.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

ProviderShareChart.displayName = 'ProviderShareChart';
