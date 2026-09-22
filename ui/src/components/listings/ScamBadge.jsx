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
 * The word is always on screen now. The old `compact` shape dropped it and left a bare triangle in
 * front of the table's title, which is where a warning is easiest to miss and hardest to explain.
 * It survived because the badge was a full-width block in the grid; at 20px high with the word in
 * it, it fits a table row without taking the headline's space.
 *
 * @param {Object} props
 * @param {Object|null} props.listing A row as the listings API returns it.
 * @param {'inline'|'onImage'} [props.variant='inline'] `onImage` carries its own opaque panel for
 *   the card's photograph; `inline` sits on a surface and spends the red on the word instead.
 * @returns {React.ReactElement|null}
 */
export default function ScamBadge({ listing, variant = 'inline' }) {
  const t = useTranslation();
  const verdict = readScamVerdict(listing);

  if (!verdict.suspicious) {
    return null;
  }

  // One reason per line. Joined with spaces, three complete sentences ran together into a
  // paragraph in which the individual reasons could no longer be told apart.
  const tooltip =
    verdict.source === 'user' ? (
      t('listings.scamMarkedByYou')
    ) : (
      <span className="scamBadge__why">
        {t('listings.scamWhy')}
        <ul>
          {verdict.signals.map((signal) => (
            <li key={signal}>{t(`listings.scamSignal.${signal}`)}</li>
          ))}
        </ul>
      </span>
    );

  return (
    <Tooltip content={tooltip} position="top">
      <span className={`scamBadge scamBadge--${variant}`}>
        <IconAlertTriangle size="small" aria-hidden="true" />
        {t('listings.scamBadge')}
      </span>
    </Tooltip>
  );
}

ScamBadge.displayName = 'ScamBadge';
