/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useRef, useState } from 'react';
import { Tag, Tooltip } from '@douyinfe/semi-ui-19';
import { getJourney } from '../../services/transitClient.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { formatDuration } from './transitFormat.js';

/**
 * The public transport travel time between one saved address and one listing.
 *
 * This is only ever meant to be rendered on a listing's own detail page - never repeated across a
 * list of listings - because journey planning is a heavier upstream request than the nearby-stops
 * and departures lookups elsewhere in the app. One badge asks for one journey, once, when the
 * detail page for that specific listing is opened.
 *
 * @param {Object} props
 * @param {number} props.fromLat
 * @param {number} props.fromLng
 * @param {number} props.toLat
 * @param {number} props.toLng
 * @returns {React.ReactNode}
 */
export default function JourneyBadge({ fromLat, fromLng, toLat, toLng }) {
  const t = useTranslation();
  const [journey, setJourney] = useState(undefined);
  const requestRef = useRef(0);

  useEffect(() => {
    if (fromLat == null || fromLng == null || toLat == null || toLng == null) return undefined;

    const request = ++requestRef.current;
    setJourney(undefined);

    getJourney(fromLat, fromLng, toLat, toLng).then((found) => {
      if (request !== requestRef.current) return;
      setJourney(found);
    });

    return () => {
      requestRef.current++;
    };
  }, [fromLat, fromLng, toLat, toLng]);

  if (journey === undefined) {
    return (
      <Tag color="grey" type="light">
        {t('transit.journeyLoading')}
      </Tag>
    );
  }

  if (journey == null) {
    return (
      <Tag color="grey" type="light">
        {t('transit.journeyUnavailable')}
      </Tag>
    );
  }

  const lines = journey.legs
    .filter((leg) => leg.mode !== 'WALK' && leg.line)
    .map((leg) => leg.line)
    .join(', ');

  return (
    <Tooltip
      content={
        journey.transfers > 0
          ? t('transit.journeyTransfers', { count: journey.transfers })
          : t('transit.journeyDirect')
      }
    >
      <Tag color="green" type="light">
        {t('transit.journeyDuration', {
          duration: formatDuration(journey.durationMinutes, {
            minuteUnit: t('common.minuteUnit'),
            hourUnit: t('common.hourUnit'),
          }),
        })}
        {lines ? ` · ${lines}` : ''}
      </Tag>
    </Tooltip>
  );
}
