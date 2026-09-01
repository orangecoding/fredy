/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useRef, useState } from 'react';
import { Popover, Spin, Typography } from '@douyinfe/semi-ui-19';
import { getTravelTimes } from '../../services/transitClient.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { availableModes, formatMinutes, formatRoadDistance, hasAnyTime } from './travelTimeFormat.js';
import TransitDetails from './TransitDetails.jsx';
import './transit.less';

const { Text } = Typography;

/**
 * How long it really takes to get from the user's saved addresses to this listing.
 *
 * The straight-line distance shown next to it is a different claim and both are worth having: one
 * says where the flat is, this one says what living there would cost in time.
 *
 * Nothing is ever invented here. An address with no answer is left out, a mode that could not be
 * routed is left out, and a listing that has not been looked at yet says so instead of showing a
 * plausible-looking number.
 *
 * @param {Object} props
 * @param {string} props.listingId
 * @param {Array<Object>} [props.travelTimes] - Already loaded entries; skips the request entirely.
 * @param {boolean} [props.compact=false] - One line per address, for a map popup.
 * @param {boolean} [props.refine=false] - Ask the backend for the exact journey even when estimates
 * are already in hand. Only the detail page does this: it is one person looking at one listing, and
 * it is what turns an estimate into a real route the map can draw.
 * @param {(entries: Array<Object>) => void} [props.onLoaded] - Called with whatever was loaded. The
 * detail map uses it to draw the real driving route, which arrives in the same answer.
 * @returns {React.ReactNode}
 */
export default function TravelTimes({ listingId, travelTimes, compact = false, refine = false, onLoaded }) {
  const t = useTranslation();
  const [entries, setEntries] = useState(travelTimes ?? null);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);
  // Held in a ref so a caller passing an inline arrow does not re-trigger the request on every
  // render of its parent.
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    // Handed the entries by the parent and not asked to improve on them, so there is nothing to
    // fetch. That is the listings overview and the map, where asking again per rendered card would
    // undo the whole point of shipping the times with the page.
    if (travelTimes != null && !refine) {
      setEntries(travelTimes);
      return undefined;
    }
    if (!listingId) return undefined;

    const request = ++requestRef.current;
    // Whatever came with the listing is shown while the exact answer is on its way, so the numbers
    // do not disappear and come back on every visit.
    setEntries(travelTimes ?? null);
    setFailed(false);

    getTravelTimes(listingId)
      .then((found) => {
        if (request !== requestRef.current) return;
        setEntries(found);
        onLoadedRef.current?.(found);
      })
      .catch(() => {
        if (request !== requestRef.current) return;
        // Only a hard failure when there was nothing to fall back on. An outage while refining
        // leaves the estimate on screen, which is still the better answer than an error.
        if (travelTimes == null) setFailed(true);
      });

    return () => {
      requestRef.current++;
    };
  }, [listingId, travelTimes, refine]);

  if (failed) {
    return (
      <Text size="small" type="tertiary">
        {t('travelTime.unavailable')}
      </Text>
    );
  }

  if (entries == null) {
    return (
      <div className="travel-times travel-times--state">
        <Spin size="small" />
        <Text size="small" type="tertiary">
          {t('travelTime.loading')}
        </Text>
      </div>
    );
  }

  const usable = entries.filter(hasAnyTime);
  if (usable.length === 0) {
    return (
      <Text size="small" type="tertiary">
        {entries.length === 0 ? t('travelTime.notComputed') : t('travelTime.noRoute')}
      </Text>
    );
  }

  return (
    <div className={`travel-times${compact ? ' travel-times--compact' : ''}`}>
      <ul className="travel-times__list">
        {usable.map((entry) => (
          <li key={entry.label} className="travel-times__entry">
            <span className="travel-times__label">{entry.label}</span>
            {/* Marked, not hidden. The scheduled estimate is good enough to compare fifty listings
                by and is not the number to quote at a viewing, so the difference is on screen.
                Only the transit figure is estimated, though: where there is no public transport the
                sweep falls back to a real driving route, and that number carries no caveat.

                A popover rather than a title attribute, because there is a real answer to give -
                which stops it was worked out from - and a tooltip is the wrong size for it. */}
            {entry.estimate && entry.transit != null && (
              <Popover showArrow position="top" trigger="hover" content={<TransitDetails entry={entry} />}>
                <span className="travel-times__estimate">{t('travelTime.estimate')}</span>
              </Popover>
            )}
            {/* Which place a place type actually resolved to. A named address is its own answer -
                the label says where it is - but "Groceries: 6 min" is a number with nothing behind
                it until it can say which supermarket that was. The same instinct as the estimate
                popover: show the working rather than ask to be trusted. */}
            {entry.place != null && (
              <span className="travel-times__place">
                {t('travelTime.placeFrom', { name: entry.place.name || t('travelTime.placeUnnamed') })}
              </span>
            )}
            <span className="travel-times__modes">
              {availableModes(entry).map((mode) => {
                const distance = mode.key === 'car' ? formatRoadDistance(entry.car.distanceMeters) : null;
                const body = (
                  <span
                    key={mode.key}
                    className={`travel-times__mode${mode.key === 'transit' ? ' travel-times__mode--detailed' : ''}`}
                    title={t(mode.labelKey)}
                  >
                    <span aria-hidden="true">{mode.icon}</span>
                    <span className="travel-times__minutes">{formatMinutes(mode.minutes)}</span>
                    {mode.transfers > 0 && (
                      <span className="travel-times__transfers">
                        {t(mode.transfers === 1 ? 'travelTime.transfer' : 'travelTime.transfers', {
                          count: mode.transfers,
                        })}
                      </span>
                    )}
                    {distance && !compact && <span className="travel-times__distance">{distance}</span>}
                  </span>
                );

                // The public transport figure is the one with something behind it worth reading:
                // the stops the journey calls at, or the ones an estimate was measured from. The
                // street modes are a single number and have nothing to unfold.
                if (mode.key !== 'transit' || compact) {
                  return body;
                }
                return (
                  <Popover
                    key={mode.key}
                    showArrow
                    position="top"
                    trigger="hover"
                    content={<TransitDetails entry={entry} />}
                  >
                    {body}
                  </Popover>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      {!compact && (
        <Text size="small" type="tertiary" className="travel-times__attribution">
          {t('travelTime.referenceNote')}{' '}
          <a href="https://transitous.org/sources/" target="_blank" rel="noreferrer noopener">
            Transitous
          </a>
          {' · '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">
            © OpenStreetMap
          </a>
        </Text>
      )}
    </div>
  );
}
