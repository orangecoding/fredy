/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Spin, Typography } from '@douyinfe/semi-ui-19';
import { getDepartures } from '../../services/transitClient.js';
import { useLocale, useTranslation } from '../../services/i18n/i18n.jsx';
import {
  contrastingTextColor,
  departureColor,
  distinctLines,
  formatClockTime,
  formatCountdown,
} from './transitFormat.js';
import './transit.less';

const { Text } = Typography;

/** Departures go stale quickly; the backend caches them for 30s, so a minute here is cheap. */
const REFRESH_INTERVAL = 60000;

/**
 * The next departures of one stop.
 *
 * Either `stopId` or `lat`/`lng` must be given - the map only knows the coordinates and the name of
 * the dot that was clicked, and the backend resolves those to a timetable stop.
 *
 * @param {Object} props
 * @param {string} [props.stopId]
 * @param {number} [props.lat]
 * @param {number} [props.lng]
 * @param {string} [props.name] - Stop name as shown on the map, helps resolve by coordinates.
 * @param {number} [props.limit=8]
 * @param {boolean} [props.showStopName=false] - Renders the resolved stop name as a heading.
 * @returns {React.ReactNode}
 */
export default function DeparturesBoard({ stopId, lat, lng, name, limit = 8, showStopName = false }) {
  const t = useTranslation();
  const locale = useLocale();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Rendering a countdown means the component has to re-render on its own, not only when the data
  // changes - "in 4 min" is wrong a minute later even if nothing was refetched.
  const [now, setNow] = useState(() => Date.now());
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const result = await getDepartures({ stopId, lat, lng, name, limit });
      if (request !== requestRef.current) return; // a newer request already answered
      setBoard(result);
      setFailed(false);
    } catch {
      if (request !== requestRef.current) return;
      setFailed(true);
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
      }
    }
  }, [stopId, lat, lng, name, limit]);

  useEffect(() => {
    setLoading(true);
    load();

    const timer = setInterval(() => {
      setNow(Date.now());
      load();
    }, REFRESH_INTERVAL);

    return () => {
      clearInterval(timer);
      // Answers arriving after unmount must not be applied.
      requestRef.current++;
    };
  }, [load]);

  if (loading) {
    return (
      <div className="transit-board transit-board--state">
        <Spin size="small" />
        <Text size="small" type="tertiary">
          {t('transit.loading')}
        </Text>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="transit-board transit-board--state">
        <Text size="small" type="tertiary">
          {t('transit.unavailable')}
        </Text>
      </div>
    );
  }

  const departures = board?.departures ?? [];

  if (departures.length === 0) {
    return (
      <div className="transit-board transit-board--state">
        <Text size="small" type="tertiary">
          {t('transit.noDepartures')}
        </Text>
      </div>
    );
  }

  return (
    <div className="transit-board">
      {showStopName && board?.stop?.name && (
        <Text strong className="transit-board__stop">
          {board.stop.name}
        </Text>
      )}
      {showStopName && (
        // Which lines call here at all - the map's rails carry no line numbers, so this summary is
        // the only place that answers it at a glance.
        <div className="transit-board__lines">
          {distinctLines(departures).map((line) => {
            const background = departureColor(line);
            return (
              <span
                key={`${line.mode}-${line.line}`}
                className="transit-board__line"
                style={{ backgroundColor: background, color: contrastingTextColor(background) }}
                title={t(`transit.mode.${line.mode.toLowerCase()}`)}
              >
                {line.line}
              </span>
            );
          })}
        </div>
      )}
      <ul className="transit-board__list">
        {departures.map((departure, index) => {
          const background = departureColor(departure);
          const countdown = formatCountdown(departure.time, t, now);

          return (
            <li key={`${departure.line}-${departure.time}-${index}`} className="transit-board__row">
              <span
                className="transit-board__line"
                style={{ backgroundColor: background, color: contrastingTextColor(background) }}
                title={t(`transit.mode.${departure.mode.toLowerCase()}`)}
              >
                {departure.line || t('transit.unknownLine')}
              </span>
              <span className="transit-board__headsign" title={departure.headsign}>
                {departure.headsign || t('common.na')}
              </span>
              <span className="transit-board__time">
                {formatClockTime(departure.time, locale)}
                {departure.delay > 0 && <span className="transit-board__delay">{`+${departure.delay}`}</span>}
                {countdown && <span className="transit-board__countdown">{countdown}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
