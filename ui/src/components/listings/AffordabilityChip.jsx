/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tooltip } from '@douyinfe/semi-ui-19';

import { VERDICT_COLORS, formatEuro, withAlpha } from '../cards/chartTheme.js';
import { verdictExplanation } from '../../services/finance/rentBasis.js';
import { useFinanceProfile } from '../../hooks/useFinanceProfile.js';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';

import './AffordabilityChip.less';

/**
 * A listing's affordability verdict, shown inline in the overview.
 *
 * The verdict travels with the listing row - the server decides it, against the same profile and
 * the same thresholds it uses for the affordability filter. It used to be derived here from a copy
 * of the finance modules, which meant a chip could contradict the filter that produced the row it
 * sat on. Renders nothing when the matching half of the profile is missing: a household that has
 * not said what it earns cannot be told whether it can afford anything.
 *
 * @param {Object} props
 * @param {'affordable'|'stretch'|'unaffordable'|null} [props.verdict] From the listings query.
 * @param {'rent'|'buy'|null} [props.dealType] Deal type of the job, from the listings query.
 * @param {boolean} [props.chargesIncluded] Whether the rent was quoted with the running charges in it,
 *   which the server measured against the warm ceiling rather than the cold one.
 */
export default function AffordabilityChip({ verdict, dealType, chargesIncluded = false }) {
  const t = useTranslation();
  const locale = useLocale();
  const { thresholds } = useFinanceProfile();

  if (verdict == null) {
    return null;
  }

  // A non-null verdict means the matching half of the profile exists, so the threshold quoted
  // in the tooltip is always there to read - the one the server measured this verdict against.
  const { key, limit } = verdictExplanation(verdict, { dealType, chargesIncluded }, thresholds);
  const color = VERDICT_COLORS[verdict];

  return (
    <Tooltip content={t(key, { price: formatEuro(limit, locale) })} position="top">
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
