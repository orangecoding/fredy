/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tooltip } from '@douyinfe/semi-ui-19';
import { IconAlertTriangle } from '@douyinfe/semi-icons';

import { readScamVerdict } from '../../services/listings/scamSignals.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';

import './ScamBadge.less';

/**
 * The warning on a listing that reads like a rental fraud.
 *
 * Says "potential" and means it. Everything behind it is a word list and a price comparison, and the
 * cost of being wrong is asymmetric in a way worth designing around: a missed warning costs somebody
 * a deposit, and a false one costs them a flat they would have applied for. So the chip warns and
 * does not hide, filter or delete anything, and the reasons are one hover away rather than buried on
 * the detail page.
 *
 * Renders nothing for the overwhelming majority of listings, and nothing at all once the user has
 * said it is fine. A warning that stays up after being dismissed is a warning people learn to look
 * past.
 *
 * @param {Object} props
 * @param {Object|null} props.listing A row as the listings API returns it.
 * @param {boolean} [props.compact=false] Icon only, words in the tooltip. The table's title column
 *   is under a hundred pixels wide, and a badge with a label in it left no room for the headline at
 *   all - the row showed a warning about a listing it could not name.
 * @returns {React.ReactElement|null}
 */
export default function ScamBadge({ listing, compact = false }) {
  const t = useTranslation();
  const verdict = readScamVerdict(listing);

  if (!verdict.suspicious) {
    return null;
  }

  const tooltip =
    verdict.source === 'user'
      ? t('listings.scamMarkedByYou')
      : [t('listings.scamWhy'), ...verdict.signals.map((signal) => t(`listings.scamSignal.${signal}`))].join(' ');

  return (
    <Tooltip content={tooltip} position="top">
      <span
        className={`scamBadge${compact ? ' scamBadge--compact' : ''}`}
        // The label is the accessible name in both shapes. Compact only drops it from the screen,
        // never from the accessibility tree, where there is no width to run out of.
        aria-label={t('listings.scamBadge')}
      >
        <IconAlertTriangle size="small" />
        {!compact && t('listings.scamBadge')}
      </span>
    </Tooltip>
  );
}

ScamBadge.displayName = 'ScamBadge';
