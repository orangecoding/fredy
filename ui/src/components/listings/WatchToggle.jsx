/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tooltip } from '@douyinfe/semi-ui-19';
import { IconStar, IconStarStroked } from '@douyinfe/semi-icons';

import './WatchToggle.less';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * The watchlist star, in one place for both views.
 *
 * The grid and the table built this twice, and the two copies had already drifted: only the
 * table's version had a focus ring, and the two used different borders and different hover
 * treatments for the same control.
 *
 * `aria-pressed` rather than colour alone. The star is a toggle, and its state has to survive
 * being read out rather than looked at - the same rule the detail page's watch button follows.
 *
 * @param {Object} props
 * @param {Object} props.listing A row as the listings API returns it.
 * @param {(e: React.MouseEvent, listing: Object) => void} props.onWatch Handed straight through;
 *   the overview's handler already calls preventDefault and stopPropagation.
 * @param {'overlay'|'inline'} [props.variant='inline'] `overlay` sits on the card's photograph,
 *   `inline` sits in the table row's action group.
 * @returns {React.ReactElement}
 */
export default function WatchToggle({ listing, onWatch, variant = 'inline' }) {
  const t = useTranslation();
  const watched = listing.isWatched === 1;
  const label = watched ? t('listings.tooltipRemoveFromWatchlist') : t('listings.tooltipAddToWatchlist');

  return (
    <Tooltip content={label}>
      <button
        type="button"
        className={`watchToggle watchToggle--${variant}${watched ? ' watchToggle--on' : ''}`}
        onClick={(e) => onWatch(e, listing)}
        aria-label={label}
        aria-pressed={watched}
      >
        {watched ? <IconStar /> : <IconStarStroked />}
      </button>
    </Tooltip>
  );
}

WatchToggle.displayName = 'WatchToggle';
