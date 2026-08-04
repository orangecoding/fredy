/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Typography } from '@douyinfe/semi-ui-19';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { formatMinutes, formatRoadDistance } from './travelTimeFormat.js';
import './transit.less';

const { Text } = Typography;

/**
 * Readable text for a coloured badge.
 *
 * Operator colours run from near-black to bright yellow, and a single fixed text colour is
 * unreadable against one end or the other. Perceived brightness decides, using the usual sRGB
 * weights - green counts for far more than blue.
 *
 * @param {string|null} color - `#rrggbb`.
 * @returns {string|undefined} A colour, or undefined to leave the default in place.
 */
function textOn(color) {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
    return undefined;
  }
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1b1b1b' : '#ffffff';
}

/**
 * One leg of a journey: which line, to where, how long.
 *
 * @param {Object} props
 * @param {Object} props.leg
 * @returns {React.ReactNode}
 */
function Leg({ leg }) {
  const t = useTranslation();
  const walking = leg.mode === 'WALK';
  const badge = leg.line || t(`travelTime.mode.${walking ? 'walk' : 'transit'}`);

  return (
    <li className="transit-journey__leg">
      <span
        className={`transit-journey__badge${walking ? ' transit-journey__badge--walk' : ''}`}
        style={leg.color ? { background: leg.color, color: textOn(leg.color) } : undefined}
      >
        {badge}
      </span>
      <span className="transit-journey__where">{leg.to || t('travelTime.legToDestination')}</span>
      <span className="transit-journey__time">{formatMinutes(leg.minutes)}</span>
    </li>
  );
}

/**
 * Where a public transport time comes from.
 *
 * Two different answers, depending on how the number was produced. An exact journey can name the
 * stops it actually calls at, which is what somebody means by "how do I get there?" - a duration on
 * its own does not answer that. An estimate cannot, because it was never a journey; what it can do
 * is name the stops it was measured from, which is what makes it checkable rather than magic.
 *
 * @param {Object} props
 * @param {Object} props.entry - A travel-time entry, as the API returns it.
 * @returns {React.ReactNode}
 */
export default function TransitDetails({ entry }) {
  const t = useTranslation();
  const legs = Array.isArray(entry?.transit?.legs) ? entry.transit.legs : [];
  const via = Array.isArray(entry?.via) ? entry.via : [];

  if (legs.length > 0) {
    return (
      <div className="transit-journey">
        <div className="transit-journey__title">{t('travelTime.journeyTitle')}</div>
        <ol className="transit-journey__list">
          {legs.map((leg, index) => (
            <Leg key={`${leg.mode}-${leg.line ?? ''}-${index}`} leg={leg} />
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="transit-journey">
      <Text size="small">{t('travelTime.estimateExplain')}</Text>
      {via.length > 0 && (
        <>
          <div className="transit-journey__title transit-journey__title--spaced">{t('travelTime.viaTitle')}</div>
          <ul className="transit-journey__list">
            {via.map((stop) => (
              <li key={`${stop.name}:${stop.lat}:${stop.lng}`} className="transit-journey__leg">
                <span className="transit-journey__badge transit-journey__badge--walk">
                  {formatMinutes(stop.minutes)}
                </span>
                <span className="transit-journey__where">{stop.name || '–'}</span>
                <span className="transit-journey__time">{formatRoadDistance(stop.walkMeters) ?? '–'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
