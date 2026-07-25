/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tooltip } from '@douyinfe/semi-ui-19';

import { VERDICT_COLORS, formatEuro, withAlpha } from '../cards/chartTheme.js';
import { useFinanceProfile } from '../../hooks/useFinanceProfile.js';
import { verdictForListing } from '../../../../lib/services/finance/affordability.js';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';

import './AffordabilityChip.less';

/**
 * A listing's affordability verdict, shown inline in the overview.
 *
 * Derived from the price, the deal type of the job that found it and the thresholds already in
 * state, so it costs no request and no per-row simulation. Renders nothing when the matching
 * half of the profile is missing - a household that has not said what it earns cannot be told
 * whether it can afford anything.
 *
 * @param {Object} props
 * @param {number|null} props.price
 * @param {'rent'|'buy'|null} [props.dealType] Deal type of the job, from the listings query.
 */
export default function AffordabilityChip({ price, dealType }) {
  const t = useTranslation();
  const locale = useLocale();
  const { thresholds } = useFinanceProfile();

  const verdict = verdictForListing(price, dealType, thresholds);
  if (verdict == null) {
    return null;
  }

  // A non-null verdict means the matching half of the profile exists, so the threshold quoted
  // in the tooltip is always there to read.
  const isRental = dealType === 'rent';
  const color = VERDICT_COLORS[verdict];

  return (
    <Tooltip
      content={t(`listings.${isRental ? 'rentAffordabilityTooltip' : 'affordabilityTooltip'}.${verdict}`, {
        price: formatEuro(isRental ? thresholds.rent.affordableMaxRent : thresholds.buy.affordableMaxPrice, locale),
      })}
      position="top"
    >
      <span
        className="affordabilityChip"
        style={{
          color,
          backgroundColor: withAlpha(color, 0.12),
          borderColor: withAlpha(color, 0.4),
        }}
      >
        {t(`finance.verdict.${verdict}`)}
      </span>
    </Tooltip>
  );
}

AffordabilityChip.displayName = 'AffordabilityChip';
