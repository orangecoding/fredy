/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Banner, Button, RadioGroup, Radio, Typography } from '@douyinfe/semi-ui-19';
import { IconClock, IconShield } from '@douyinfe/semi-icons';

import MapCanvas from '../../../components/map/Map.jsx';
import TravelTimes from '../../../components/transit/TravelTimes.jsx';
import { TRAVEL_MODES } from '../../../components/transit/travelTimeFormat.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';
import './ListingLocationCard.less';

const { Text } = Typography;

/**
 * Whether any address has a drawable route in this mode.
 *
 * Drives the note next to the picker: falling back to the straight line without saying so would
 * look like the route simply is a straight line.
 *
 * @param {Array<Object>} travelTimes
 * @param {string} mode
 * @returns {boolean}
 */
export function hasRouteFor(travelTimes, mode) {
  return (Array.isArray(travelTimes) ? travelTimes : []).some((entry) =>
    mode === 'transit' ? (entry.transit?.legs?.length ?? 0) > 0 : Boolean(entry[mode]?.geometry),
  );
}

/**
 * Everything about where the listing is, in one card.
 *
 * These four things used to be spread across both columns of the page: the map on the left, and
 * the route picker that redraws it, the travel times it draws routes for, and the location report
 * for the same address all on the right. A control and the thing it controls belong in each
 * other's sight.
 *
 * Without coordinates the map is replaced by the banner it always was - with its retry intact -
 * while the rows below stay, because the location report and the travel times are computed from
 * whatever the listing does have.
 *
 * @param {Object} props
 * @param {Object} props.listing
 * @param {boolean} props.hasGeo
 * @param {boolean} props.geoUnresolved - True only for an address the geocoder rejected outright.
 * @param {string[]} props.countries - Which countries the map may roam.
 * @param {number[]|undefined} props.mapCenter
 * @param {boolean} props.mapExpanded
 * @param {(expanded: boolean) => void} props.onExpandedChange
 * @param {{address: string}|null} props.pinDrop
 * @param {{lat: number, lng: number}|null} props.pickedCoords
 * @param {(coords: {lat: number, lng: number}) => void} props.onPick
 * @param {boolean} props.pinSaving
 * @param {() => void} props.onSavePin
 * @param {() => void} props.onCancelPin
 * @param {(map: Object) => void} props.onMapReady
 * @param {boolean} props.geocodeRetrying
 * @param {() => void} props.onRetryGeocode
 * @param {string} props.routeMode
 * @param {(mode: string) => void} props.onRouteModeChange
 * @param {Array<Object>} props.routeTimes
 * @param {(entries: Array<Object>) => void} props.onTravelTimesLoaded
 * @param {string|null} props.lagecheckHref
 * @param {() => void} props.onLagecheckOpen
 * @returns {React.ReactElement}
 */
export default function ListingLocationCard({
  listing,
  hasGeo,
  geoUnresolved,
  countries,
  mapCenter,
  mapExpanded,
  onExpandedChange,
  pinDrop,
  pickedCoords,
  onPick,
  pinSaving,
  onSavePin,
  onCancelPin,
  onMapReady,
  geocodeRetrying,
  onRetryGeocode,
  routeMode,
  onRouteModeChange,
  routeTimes,
  onTravelTimesLoaded,
  lagecheckHref,
  onLagecheckOpen,
}) {
  const t = useTranslation();
  const hasCoordinates = listing?.latitude != null && listing?.longitude != null;

  return (
    <section className="listing-card listing-location">
      <div className="listing-location__head">
        <h2 className="listing-card__label">{t('listing.detail.locationTitle')}</h2>

        {/* The control sits on the thing it changes now, rather than a screen away under the
            travel times. A mode with no route stored falls back to the straight line and says so. */}
        {hasCoordinates && (
          <div className="listing-location__picker">
            <RadioGroup
              type="button"
              value={routeMode}
              onChange={(event) => onRouteModeChange(event.target.value)}
              aria-label={t('listing.detail.routeLabel')}
            >
              <Radio value="straight">{t('listing.detail.routeStraight')}</Radio>
              {TRAVEL_MODES.map((mode) => (
                <Radio key={mode.key} value={mode.key}>
                  <span aria-hidden="true">{mode.icon}</span> {t(mode.labelKey)}
                </Radio>
              ))}
            </RadioGroup>
            {routeMode !== 'straight' && !hasRouteFor(routeTimes, routeMode) && (
              <Text size="small" type="tertiary">
                {t('listing.detail.routeMissing')}
              </Text>
            )}
          </div>
        )}
      </div>

      {/* A listing with no coordinates normally gets a warning instead of a map - but those are
          exactly the ones somebody wants to place by hand, so pin dropping brings the map out
          anyway. */}
      {!hasGeo && !pinDrop ? (
        <Banner
          type="warning"
          bordered
          description={
            <div className="listing-location__nogeo">
              <span>{geoUnresolved ? t('listing.detail.noGeoWarning') : t('listing.detail.noGeoPending')}</span>
              {/* Only for the temporary case. Offering "try again" for an address the geocoder has
                  already rejected would be offering the same answer twice. */}
              {!geoUnresolved && (
                <Button size="small" loading={geocodeRetrying} onClick={onRetryGeocode}>
                  {t('listing.detail.geoRetry')}
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <div className="listing-location__map">
          {/* Public transport on by default: the first question about any flat is how to get out of
              it, and the answer should already be on screen. */}
          <MapCanvas
            countries={countries}
            initialCenter={mapCenter}
            initialZoom={hasGeo ? 14 : 10}
            defaultShowTransit
            cooperativeGestures
            expanded={mapExpanded}
            onExpandedChange={onExpandedChange}
            pickMode={pinDrop != null}
            onPick={onPick}
            onMapReady={onMapReady}
          >
            {pinDrop != null && (
              <div className="listing-location__pin-bar">
                <div className="listing-location__pin-bar-text">
                  <Text>{pickedCoords ? t('listing.detail.pinDropPicked') : t('listing.detail.pinDropHint')}</Text>
                  <Text type="tertiary" size="small">
                    {pinDrop.address}
                  </Text>
                </div>
                <Button
                  theme="solid"
                  type="primary"
                  size="small"
                  disabled={!pickedCoords}
                  loading={pinSaving}
                  onClick={onSavePin}
                >
                  {t('listing.detail.pinDropSave')}
                </Button>
                <Button size="small" theme="borderless" onClick={onCancelPin}>
                  {t('common.cancel')}
                </Button>
              </div>
            )}
          </MapCanvas>
        </div>
      )}

      {lagecheckHref && (
        <div className="listing-location__row">
          <IconShield className="listing-location__row-icon" aria-hidden="true" />
          {/* Title and blurb on one line. Stacked, a two-line block for a single outbound link
              claimed more of the card than the link is worth. */}
          <div className="listing-location__row-body listing-location__row-body--inline">
            <span className="listing-location__row-title">{t('lagecheck.title')}</span>
            <Text size="small" type="tertiary" className="listing-location__row-detail">
              {t('lagecheck.description')}
            </Text>
          </div>
          <a
            className="listing-location__link"
            href={lagecheckHref}
            target="_blank"
            rel="noreferrer noopener"
            onClick={onLagecheckOpen}
          >
            {t('lagecheck.link')}
          </a>
        </div>
      )}

      {/* Straight-line distances to the saved addresses. Kept directly above the travel times
          because the two answer the same question and the second one is the honest answer. */}
      {Array.isArray(listing?.distances) && listing.distances.length > 0 && (
        <div className="listing-location__row">
          <div className="listing-location__row-body">
            <span className="listing-location__row-title">{t('listing.detail.distanceToHome')}</span>
            <span className="listing-location__distances">
              {listing.distances.map((distance) => (
                <span key={distance.label} className="listing-location__distance">
                  {distance.label}: {distance.meters} m
                </span>
              ))}
            </span>
          </div>
        </div>
      )}

      {/* The honest answer to the question the straight-line distance only approximates. It loads
          on its own: a listing found minutes ago has not been routed yet, and this is where
          somebody would look. */}
      {hasCoordinates && (
        <div className="listing-location__row">
          <IconClock className="listing-location__row-icon" aria-hidden="true" />
          <div className="listing-location__row-body listing-location__row-body--inline">
            <span className="listing-location__row-title">{t('travelTime.title')}</span>
            <TravelTimes
              listingId={listing.id}
              travelTimes={listing.travelTimes}
              refine
              onLoaded={onTravelTimesLoaded}
            />
          </div>
        </div>
      )}

      {/* Every source this card drew on, said once at the bottom.

          Each row used to carry its own credit - geosci under the location report, Transitous and
          OpenStreetMap under the travel times - which put two grey sentences in the middle of the
          card and made the block between them look like a fragment. OpenStreetMap's licence wants
          the credit visible, not repeated, so the row-level ones are hidden by the stylesheet and
          this is the one that shows. */}
      {(lagecheckHref || hasCoordinates) && (
        <Text size="small" type="tertiary" className="listing-location__sources">
          {t('travelTime.referenceNote')}{' '}
          {hasCoordinates && (
            <>
              <a
                className="listing-location__link"
                href="https://transitous.org/sources/"
                target="_blank"
                rel="noreferrer noopener"
              >
                Transitous
              </a>
              {' · '}
              <a
                className="listing-location__link"
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer noopener"
              >
                © OpenStreetMap
              </a>
            </>
          )}
          {hasCoordinates && lagecheckHref && ' · '}
          {lagecheckHref && (
            <a className="listing-location__link" href="https://geosci.de/" target="_blank" rel="noreferrer noopener">
              geosci.de
            </a>
          )}
        </Text>
      )}
    </section>
  );
}

ListingLocationCard.displayName = 'ListingLocationCard';
