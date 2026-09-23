/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { MARKER_COLORS } from './markerColors.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';

import './MapLegend.less';

/**
 * What the colours on the map mean.
 *
 * Four of them carry meaning - a listing, a stack of listings at one address, a listing inside the
 * distance ring, one of the user's own addresses - and until now nothing said so.
 *
 * Only the entries that are actually on screen. A key explaining an orange pin on a map with no
 * ring is a key that has to be read past.
 *
 * @param {Object} props
 * @param {boolean} props.hasStacks
 * @param {boolean} props.hasRing
 * @param {boolean} props.hasHome
 * @returns {React.ReactElement}
 */
export default function MapLegend({ hasStacks, hasRing, hasHome }) {
  const t = useTranslation();

  const entries = [
    { key: 'listing', color: MARKER_COLORS.listing, show: true },
    // No colour of its own: the dot takes the badge's accent token from the stylesheet, so it is
    // the same red as the badge it explains in both themes.
    { key: 'stack', color: null, show: hasStacks },
    { key: 'inRing', color: MARKER_COLORS.inRing, show: hasRing },
    { key: 'home', color: MARKER_COLORS.home, show: hasHome },
  ].filter((entry) => entry.show);

  return (
    <div className="mapLegend">
      {entries.map((entry) => (
        <span className="mapLegend__entry" key={entry.key}>
          <span
            className={`mapLegend__dot mapLegend__dot--${entry.key}`}
            style={entry.color == null ? undefined : { background: entry.color }}
          />
          {t(`map.legend.${entry.key}`)}
        </span>
      ))}
    </div>
  );
}

MapLegend.displayName = 'MapLegend';
