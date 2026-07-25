/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { VERDICT_COLORS, formatEuro, withAlpha } from '../../../components/cards/chartTheme.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

import './VerdictBanner.less';

/**
 * The one-sentence answer, stated plainly and colour-coded.
 *
 * Shared by the calculator and the listing detail card so a listing never gets one verdict in
 * one place and a different one somewhere else.
 *
 * @param {Object} props
 * @param {'affordable'|'stretch'|'unaffordable'} props.verdict
 * @param {number|null} props.share Rate as a fraction of net income, including existing debt.
 * @param {number} props.monthlyRate
 * @param {number} [props.recommendedRate] What the 35 % rule allows.
 * @param {number} [props.maxPrice] Highest purchase price that stays inside the rule.
 * @param {string|null} [props.advice] Replaces the purchase-specific advice line - renting has
 *   no purchase price to quote, but the same budget ceiling is still worth naming.
 * @param {boolean} [props.compact] Tighter layout for the listing detail card.
 */
export default function VerdictBanner({
  verdict,
  share,
  monthlyRate,
  recommendedRate,
  maxPrice,
  advice: customAdvice,
  compact = false,
}) {
  const t = useTranslation();
  const locale = useLocale();

  const color = VERDICT_COLORS[verdict] ?? VERDICT_COLORS.unaffordable;
  const percent = share == null ? null : (share * 100).toFixed(0);

  const headline =
    percent == null
      ? t(`finance.verdict.${verdict}`)
      : t(`finance.verdict.${verdict}Detail`, { percent, rate: formatEuro(monthlyRate, locale) });

  // Only say something useful when it is actually useful: an affordable purchase does not
  // need to be told what it could have spent.
  const advice =
    customAdvice !== undefined
      ? customAdvice
      : verdict === 'affordable'
        ? null
        : recommendedRate > 0
          ? t('finance.verdict.advice', {
              rate: formatEuro(recommendedRate, locale),
              price: formatEuro(maxPrice, locale),
            })
          : t('finance.verdict.adviceNoRoom');

  return (
    <div
      className={`verdictBanner${compact ? ' verdictBanner--compact' : ''}`}
      style={{ borderColor: withAlpha(color, 0.45), backgroundColor: withAlpha(color, 0.08) }}
      role="status"
    >
      <span className="verdictBanner__dot" style={{ backgroundColor: color }} aria-hidden="true" />
      <div className="verdictBanner__body">
        <span className="verdictBanner__headline" style={{ color }}>
          {headline}
        </span>
        {advice && <span className="verdictBanner__advice">{advice}</span>}
      </div>
    </div>
  );
}

VerdictBanner.displayName = 'VerdictBanner';
