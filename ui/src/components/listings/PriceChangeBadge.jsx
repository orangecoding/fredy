/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tooltip } from '@douyinfe/semi-ui-19';

import { formatEuroPrice } from '../../services/price/priceService.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import './PriceChangeBadge.less';

/**
 * The most recent price move on a listing, as a compact arrow and percentage.
 *
 * Renders nothing when the listing has no recorded previous price, which is every listing until
 * price tracking is switched on and finds something. A badge reading "0%" on hundreds of rows would
 * make the feature look broken rather than idle.
 *
 * The previous price and the date live in a tooltip rather than in the row: at overview density the
 * only thing worth the horizontal space is the direction and the size of the move.
 *
 * @param {Object} props
 * @param {number|null|undefined} props.price Current price.
 * @param {number|null|undefined} props.previousPrice Price before the most recent change.
 * @param {number|null|undefined} props.changedAt Epoch milliseconds of that change.
 * @returns {React.ReactElement|null}
 */
export default function PriceChangeBadge({ price, previousPrice, changedAt }) {
  const t = useTranslation();

  const current = Number(price);
  const previous = Number(previousPrice);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0 || current === previous) {
    return null;
  }

  const percent = ((current - previous) / previous) * 100;
  const dropped = current < previous;
  const label = `${dropped ? '↓' : '↑'} ${percent > 0 ? '+' : '-'}${Math.abs(percent).toFixed(1)} %`;

  const tooltip = [
    t('listings.priceChangeFrom', { price: formatEuroPrice(previous) }),
    changedAt ? new Date(Number(changedAt)).toLocaleDateString() : null,
  ]
    .filter(Boolean)
    .join(' - ');

  return (
    <Tooltip content={tooltip}>
      <span className={`priceChangeBadge priceChangeBadge--${dropped ? 'down' : 'up'}`}>{label}</span>
    </Tooltip>
  );
}

PriceChangeBadge.displayName = 'PriceChangeBadge';
