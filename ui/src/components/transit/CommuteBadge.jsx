/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { formatMinutes, hasAnyTime, primaryMode } from './travelTimeFormat.js';
import './transit.less';

/**
 * The shortest way to say "and it takes this long to get there" on a listing card.
 *
 * A card is scanned, not read, so this shows one number per address - the mode that address is
 * measured in - rather than the full breakdown the detail page carries. Renders nothing at all when
 * there is nothing to say, which is the case for every listing until the sweep has reached it.
 *
 * @param {Object} props
 * @param {Array<Object>} [props.travelTimes]
 * @returns {React.ReactNode}
 */
export default function CommuteBadge({ travelTimes }) {
  const usable = Array.isArray(travelTimes) ? travelTimes.filter(hasAnyTime) : [];
  if (usable.length === 0) {
    return null;
  }

  return (
    <div className="commute-badge">
      {usable.map((entry) => {
        const mode = primaryMode(entry);
        return (
          <span key={entry.label} className="commute-badge__item" title={entry.label}>
            <span aria-hidden="true">{mode.icon}</span>
            <span className="commute-badge__minutes">{formatMinutes(mode.minutes)}</span>
            <span className="commute-badge__label">{entry.label}</span>
          </span>
        );
      })}
    </div>
  );
}
