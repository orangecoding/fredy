/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tooltip } from '@douyinfe/semi-ui-19';
import { IconChevronDown, IconChevronUp, IconExpand, IconGridView, IconHelpCircle } from '@douyinfe/semi-icons';

import IconEuro from '../../../components/icons/IconEuro.jsx';
import { describeBenchmark } from '../../../components/listings/PricePerSqmBadge.jsx';
import PriceHistoryChart from './PriceHistoryChart.jsx';
import { buildObjectFacts } from '../listingFacts.js';
import { formatDeviation } from '../../../services/listings/marketBenchmark.js';
import { VERDICT_COLORS, formatEuro, withAlpha } from '../../../components/cards/chartTheme.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';
import './ListingKeyFacts.less';

/** One icon per tile, in the order `buildObjectFacts` returns them. */
const TILE_ICONS = {
  size: <IconExpand />,
  rooms: <IconGridView />,
  pricePerSqm: <IconEuro />,
};

/**
 * The market comparison as one sentence a reader can act on.
 *
 * The badge used elsewhere in the app leads with the price per square metre and appends the
 * deviation, which is right in a table where the quotient is the column. Here the quotient already
 * has a tile of its own, so the only thing left to say is the direction - and a direction reads
 * faster as a coloured pill with an arrow than as a percentage in brackets.
 *
 * @param {Object} props
 * @param {{percent: number|null, verdict: string|null}} props.benchmark
 * @returns {React.ReactElement|null}
 */
function MarketPill({ benchmark }) {
  const t = useTranslation();
  const locale = useLocale();
  const { verdict, percent } = benchmark;

  if (verdict == null) return null;

  const label =
    verdict === 'inline'
      ? t('listings.marketPill.inline')
      : t(`listings.marketPill.${verdict}`, { percent: formatDeviation(Math.abs(percent), locale, false) });

  return (
    <Tooltip content={describeBenchmark(benchmark, t, locale)} position="top">
      <span className={`listing-keyfacts__market listing-keyfacts__market--${verdict}`}>
        {/* Down is always cheaper and up is always dearer, on this page and everywhere else. The
            arrow carries that on its own, so the colour is confirmation rather than the message. */}
        {verdict === 'above' ? <IconChevronUp aria-hidden="true" /> : <IconChevronDown aria-hidden="true" />}
        {label}
      </span>
    </Tooltip>
  );
}

/**
 * The figures a listing is judged by, in the order the questions are asked.
 *
 * What it costs comes first and largest, because every other number on the page is read against
 * it; how it compares to the area comes next, because that is the only figure two listings can be
 * compared on; and the three properties that fix the shape of the flat follow as tiles.
 *
 * The explanations used to live in a tooltip wrapped around each whole row, with `cursor: help` as
 * the only sign they were there - which on a touch screen means they were not there at all. Each
 * one now hangs off a visible icon next to its label.
 *
 * @param {Object} props
 * @param {Object} props.listing
 * @param {Array<Object>} props.priceHistory - Readings as the API returns them.
 * @param {Object} [props.financeThresholds] - As `useFinanceProfile` returns them.
 * @returns {React.ReactElement}
 */
export default function ListingKeyFacts({ listing, priceHistory, financeThresholds }) {
  const t = useTranslation();
  const locale = useLocale();
  const na = t('common.na');

  const { price, benchmark, tiles, affordability } = buildObjectFacts(listing, {
    t,
    locale,
    financeThresholds,
    describeBenchmark,
    formatEuro,
  });

  return (
    <section className="listing-card listing-keyfacts">
      <h2 className="listing-card__label">{t('listing.detail.keyFactsTitle')}</h2>

      <div className="listing-keyfacts__price">
        <span className="listing-keyfacts__amount">{price.amount}</span>
        {price.currency && <span className="listing-keyfacts__currency">{price.currency}</span>}
        {price.reference && <span className="listing-keyfacts__reference">{price.reference}</span>}
      </div>

      {benchmark != null && <MarketPill benchmark={benchmark} />}

      {affordability && (
        <Tooltip content={affordability.helpText} position="top">
          <span
            className="listing-keyfacts__affordability"
            style={{
              color: VERDICT_COLORS[affordability.verdict],
              backgroundColor: withAlpha(VERDICT_COLORS[affordability.verdict], 0.12),
              borderColor: withAlpha(VERDICT_COLORS[affordability.verdict], 0.4),
            }}
          >
            {affordability.label}
          </span>
        </Tooltip>
      )}

      <div className="listing-keyfacts__tiles">
        {tiles.map((tile) => (
          <div key={tile.id} className="listing-keyfacts__tile">
            <span className="listing-keyfacts__tile-icon" aria-hidden="true">
              {TILE_ICONS[tile.id]}
            </span>
            <span className="listing-keyfacts__tile-value">{tile.value ?? na}</span>
            <span className="listing-keyfacts__tile-label">
              {tile.label}
              <Tooltip content={tile.helpText} position="top">
                <IconHelpCircle
                  className="listing-keyfacts__help"
                  role="img"
                  aria-label={t('listing.detail.explain', { field: tile.label })}
                />
              </Tooltip>
            </span>
          </div>
        ))}
      </div>

      {/* Directly under the figures it explains. Hidden below two readings, so a listing whose
          price has never moved shows nothing at all rather than an empty frame. */}
      {priceHistory.length >= 2 && (
        <div className="listing-keyfacts__history">
          <h3 className="listing-keyfacts__history-title">{t('listing.detail.priceHistory')}</h3>
          <PriceHistoryChart data={priceHistory} locale={locale} />
        </div>
      )}
    </section>
  );
}

ListingKeyFacts.displayName = 'ListingKeyFacts';
