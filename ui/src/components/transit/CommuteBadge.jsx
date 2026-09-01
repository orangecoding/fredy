/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useMemo } from 'react';

import {
  addressesWithBudget,
  commuteBand,
  commuteBandMode,
  formatMinutes,
  hasAnyTime,
  primaryMode,
} from './travelTimeFormat.js';
import { measuredPlaces } from '../../utils.js';
import { useSelector } from '../../services/state/store';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import './transit.less';

/**
 * The shortest way to say "and it takes this long to get there" on a listing card.
 *
 * A card is scanned, not read, so this shows one number per address - the mode that address is
 * measured in - rather than the full breakdown the detail page carries. Renders nothing at all when
 * there is nothing to say, which is the case for every listing until the sweep has reached it.
 *
 * Where the job that found this listing has a commute limit, the number is coloured against it with
 * the same three bands the map pins use, so a card and a pin never disagree about the same flat.
 * Colour is never the only carrier: the band is also in the item's tooltip.
 *
 * Both the addresses and the job come from the store rather than from props, because the two callers
 * - the grid and the table - render this a few layers down and neither has any other reason to know
 * about them.
 *
 * @param {Object} props
 * @param {Array<Object>} [props.travelTimes]
 * @param {string} [props.jobId] - The job this listing was found by, whose limits it is judged
 *   against. Without one the badge simply shows the times, which is what it did before limits
 *   existed.
 * @returns {React.ReactNode}
 */
export default function CommuteBadge({ travelTimes, jobId }) {
  const t = useTranslation();
  const userSettings = useSelector((state) => state.userSettings.settings);
  const jobs = useSelector((state) => state.jobsData.jobs);

  const budgeted = useMemo(() => {
    const job = (jobs ?? []).find((candidate) => candidate?.id === jobId);
    return addressesWithBudget(measuredPlaces(userSettings), job?.commuteFilter);
  }, [jobs, jobId, userSettings]);

  const usable = Array.isArray(travelTimes) ? travelTimes.filter(hasAnyTime) : [];
  if (usable.length === 0) {
    return null;
  }

  return (
    <div className="commute-badge">
      {usable.map((entry) => {
        const mode = primaryMode(entry);
        const address = budgeted.find((candidate) => candidate?.label === entry.label);
        // Only when the number on the card is the number the limit was measured against. The two
        // can come apart on a row written before the mode was recorded - the card then leads with
        // the first mode that has an answer, which may not be the one the address is set to - and a
        // green "1 h 20" that is really about a ten minute walk is worse than no colour at all.
        const band = mode.key === commuteBandMode(entry, address) ? commuteBand(entry, address) : null;
        const title = band == null ? entry.label : `${entry.label} · ${t(`map.commuteBand.${band}`)}`;
        return (
          <span key={entry.label} className="commute-badge__item" title={title}>
            <span aria-hidden="true">{mode.icon}</span>
            <span className={`commute-badge__minutes${band == null ? '' : ` commute-badge__minutes--${band}`}`}>
              {formatMinutes(mode.minutes)}
            </span>
            <span className="commute-badge__label">{entry.label}</span>
          </span>
        );
      })}
    </div>
  );
}
