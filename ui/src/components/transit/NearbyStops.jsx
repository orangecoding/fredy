/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useRef, useState } from 'react';
import { Spin, Typography } from '@douyinfe/semi-ui-19';
import { IconChevronDown, IconChevronRight } from '@douyinfe/semi-icons';
import { getNearbyStops } from '../../services/transitClient.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import DeparturesBoard from './DeparturesBoard.jsx';
import { formatDistance } from './transitFormat.js';
import './transit.less';

const { Text } = Typography;

/**
 * The public transport stops closest to a place, each expandable into its next departures.
 *
 * @param {Object} props
 * @param {number} props.lat
 * @param {number} props.lng
 * @param {number} [props.limit=3] - How many stops to list.
 * @param {number} [props.departureLimit=6] - How many departures to show per stop.
 * @param {boolean} [props.expandFirst=false] - Opens the closest stop right away.
 * @returns {React.ReactNode}
 */
export default function NearbyStops({ lat, lng, limit = 3, departureLimit = 6, expandFirst = false }) {
  const t = useTranslation();
  const [stops, setStops] = useState(null);
  const [failed, setFailed] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (lat == null || lng == null) return undefined;

    const request = ++requestRef.current;
    setStops(null);
    setFailed(false);

    getNearbyStops(lat, lng, limit)
      .then((found) => {
        if (request !== requestRef.current) return;
        setStops(found);
        setExpandedId(expandFirst && found.length > 0 ? found[0].id : null);
      })
      .catch(() => {
        if (request !== requestRef.current) return;
        setFailed(true);
      });

    return () => {
      requestRef.current++;
    };
  }, [lat, lng, limit, expandFirst]);

  if (failed) {
    return (
      <Text size="small" type="tertiary">
        {t('transit.unavailable')}
      </Text>
    );
  }

  if (stops == null) {
    return (
      <div className="transit-stops transit-stops--state">
        <Spin size="small" />
        <Text size="small" type="tertiary">
          {t('transit.loading')}
        </Text>
      </div>
    );
  }

  if (stops.length === 0) {
    return (
      <Text size="small" type="tertiary">
        {t('transit.noStops')}
      </Text>
    );
  }

  return (
    <ul className="transit-stops">
      {stops.map((stop) => {
        const expanded = expandedId === stop.id;

        return (
          <li key={stop.id} className="transit-stops__item">
            <button
              type="button"
              className="transit-stops__header"
              aria-expanded={expanded}
              onClick={() => setExpandedId(expanded ? null : stop.id)}
            >
              {expanded ? <IconChevronDown size="small" /> : <IconChevronRight size="small" />}
              <span className="transit-stops__name">{stop.name}</span>
              <span className="transit-stops__distance">{formatDistance(stop.distance)}</span>
            </button>
            {expanded && <DeparturesBoard stopId={stop.id} name={stop.name} limit={departureLimit} />}
          </li>
        );
      })}
    </ul>
  );
}
