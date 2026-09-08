/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tooltip } from '@douyinfe/semi-ui-19';

import { formatDeviation, formatPricePerSqm, readMarketBenchmark } from '../../services/listings/marketBenchmark.js';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';

import './PricePerSqmBadge.less';

/**
 * What a square metre of this listing costs, and how that compares to the area.
 *
 * The number German listings are actually judged by. A price on its own says nothing without the
 * size next to it, and the size is not even on the card, so the quotient is the only figure that
 * lets two cards be compared at a glance.
 *
 * Two halves, shown independently. The quotient needs nothing but the listing and appears as soon
 * as the provider stated a size. The comparison needs neighbours: it appears once Fredy has seen
 * enough listings around this one, and until then the badge shows the price per square metre alone
 * rather than a grey placeholder promising a number that may never come.
 *
 * Renders nothing at all when the provider gave no size, which is the same silence
 * {@link PriceChangeBadge} keeps for a listing whose price has never moved.
 *
 * @param {Object} props
 * @param {Object|null} props.listing A row as the listings API returns it.
 * @param {boolean} [props.withTooltip=true] Whether the badge explains itself on hover. The detail
 *   page sits every figure inside a tooltip of its own already, and a second one nested in it
 *   fights the first for the pointer.
 * @returns {React.ReactElement|null}
 */
export default function PricePerSqmBadge({ listing, withTooltip = true }) {
  const t = useTranslation();
  const locale = useLocale();

  const benchmark = readMarketBenchmark(listing);
  if (benchmark == null) {
    return null;
  }

  const { pricePerSqm, percent, verdict } = benchmark;

  const badge = (
    <span className="pricePerSqmBadge">
      <span className="pricePerSqmBadge__value">{formatPricePerSqm(pricePerSqm, locale)}</span>
      {verdict != null && (
        <span className={`pricePerSqmBadge__deviation pricePerSqmBadge__deviation--${verdict}`}>
          {formatDeviation(percent, locale)}
        </span>
      )}
    </span>
  );

  if (!withTooltip) {
    return badge;
  }

  return (
    <Tooltip content={describeBenchmark(benchmark, t, locale)} position="top">
      {badge}
    </Tooltip>
  );
}

/**
 * The sentence behind the badge: what the area costs, and out of how many listings.
 *
 * Exported because the listing detail page needs the same words in its own tooltip, where the badge
 * itself renders without one.
 *
 * @param {ReturnType<import('../../services/listings/marketBenchmark.js').readMarketBenchmark>} benchmark
 * @param {(key: string, params?: Object) => string} t
 * @param {string} locale
 * @returns {string}
 */
export function describeBenchmark(benchmark, t, locale) {
  if (benchmark == null) {
    return '';
  }
  const { median, sampleSize, radiusKm, percent, verdict } = benchmark;
  if (verdict == null) {
    return t('listings.pricePerSqmNoBenchmark');
  }
  return [
    t(`listings.pricePerSqmVerdict.${verdict}`, { percent: formatDeviation(Math.abs(percent), locale, false) }),
    t('listings.pricePerSqmTooltip', {
      median: formatPricePerSqm(median, locale),
      count: String(sampleSize ?? 0),
      radius: String(radiusKm ?? 0),
    }),
  ].join(' ');
}

PricePerSqmBadge.displayName = 'PricePerSqmBadge';
