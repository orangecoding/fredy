/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useSelector, useActions } from '../../services/state/store.js';
import { Banner, Button, Image, Space, Spin, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconMaximize } from '@douyinfe/semi-icons';

import maplibregl from '../../components/map/maplibre.js';
import { HOME_MARKER_COLOR } from '../../components/map/Map.jsx';
import { useProviderCountries } from '../../hooks/useProviderCountries.js';
import { useScreenWidth } from '../../hooks/screenWidth.js';
import no_image from '../../assets/no_image.png';
import { getBoundsFromCoords } from './mapUtils.js';
import { applyRouteLayers, buildRouteData, placeTargets } from './detailMapLayers.js';
import { getAddresses } from '../../utils.js';
import { lagecheckUrl } from '../../services/listings/lagecheckUrl.js';
import { xhrPost, xhrGet, xhrDelete, errorMessage } from '../../services/xhr.js';
import ListingDeletionModal from '../../components/ListingDeletionModal.jsx';
import ApplicationModal from './components/ApplicationModal.jsx';

import IconEuro from '../../components/icons/IconEuro.jsx';
import ScamPanel from './components/ScamPanel.jsx';
import ListingFinanceCard from './components/ListingFinanceCard.jsx';
import NearbyStops from '../../components/transit/NearbyStops.jsx';
import ConnectivityCard from '../../components/connectivity/ConnectivityCard.jsx';
import ListingActionBar from './components/ListingActionBar.jsx';
import ListingTitleBlock from './components/ListingTitleBlock.jsx';
import ListingKeyFacts from './components/ListingKeyFacts.jsx';
import ListingOrigin from './components/ListingOrigin.jsx';
import ListingLocationCard from './components/ListingLocationCard.jsx';
import ListingWorkspace from './components/ListingWorkspace.jsx';
import ListingDescriptionCard from './components/ListingDescriptionCard.jsx';
import './ListingDetail.less';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { useFinanceProfile } from '../../hooks/useFinanceProfile.js';

const { Text } = Typography;

/** Above this the page is two columns; below it everything stacks into one. */
const RAIL_BREAKPOINT = 1180;
/** Below this the action bar moves to the bottom edge and the secondary cards fold shut. */
const PHONE_BREAKPOINT = 768;

/**
 * A card that folds itself shut on a phone and stays open everywhere else.
 *
 * One column of six open cards is a very long page, and the ones worth folding are the ones read
 * second: the ad's own prose, the workspace, and the two enrichment cards. The `<details>` element
 * does the whole job - it is keyboard operable and announced as a disclosure without a line of
 * JavaScript - and the card inside gives up its own heading to the summary, which is why the
 * stylesheet hides it.
 *
 * @param {Object} props
 * @param {boolean} props.enabled - Whether to fold at all. False renders the children bare.
 * @param {string} props.title
 * @param {string} [props.hint] - The one-line gist shown while shut.
 * @param {React.ReactNode} props.children
 * @returns {React.ReactNode}
 */
function PhoneCollapse({ enabled, title, hint, children }) {
  if (!enabled) return children;

  return (
    <details className="listing-collapse">
      <summary className="listing-collapse__summary">
        <span className="listing-collapse__title">{title}</span>
        {hint && <span className="listing-collapse__hint">{hint}</span>}
      </summary>
      {children}
    </details>
  );
}

/**
 * The listing detail page.
 *
 * A layout container and nothing else: it owns the data, the map instance and the handlers, and
 * hands each section the slice it needs. The rule the arrangement follows is that the left column
 * is the flat - pictures, the ad's words, where it is - and the rail on the right is the case for
 * or against it: what it costs, where the row came from, what it would cost to finance, and how
 * well connected the address is. Nothing moves between the two.
 *
 * @returns {React.ReactElement|null}
 */
export default function ListingDetail() {
  const t = useTranslation();
  const { listingId } = useParams();
  const navigate = useNavigate();
  const actions = useActions();
  const { isComplete: buyComplete, rentComplete, thresholds: financeThresholds } = useFinanceProfile();
  const listing = useSelector((state) => state.listingsData.currentListing);
  const userSettings = useSelector((state) => state.userSettings.settings);
  const connectivityEnabled = useSelector((state) => state.generalSettings.settings?.connectivityEnabled === true);
  const pois = useSelector((state) => state.tracking.pois);
  const savedAddresses = useMemo(() => getAddresses(userSettings), [userSettings]);
  const listingDeletionPref = userSettings?.listing_deletion_preference;
  const defaultDeleteType = listingDeletionPref?.hardDelete ? 'hard' : 'soft';
  // The listing does name a provider, but the pin can be dragged anywhere the user's own searches
  // reach, so the map takes the same account-wide union the listings map does.
  const countries = useProviderCountries();
  const screenWidth = useScreenWidth();
  const wide = screenWidth >= RAIL_BREAKPOINT;
  const phone = screenWidth < PHONE_BREAKPOINT;
  const map = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [applicationVisible, setApplicationVisible] = useState(false);
  const [imagePreview, setImagePreview] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [priceHistory, setPriceHistory] = useState([]);
  // Set while the user is placing the listing by hand: carries the address text they typed, waiting
  // for the coordinates the map is about to give it.
  const [pinDrop, setPinDrop] = useState(null);
  /** Whether a manual "try again" lookup is in flight, so the button can say so. */
  const [geocodeRetrying, setGeocodeRetrying] = useState(false);
  const [detailsFetching, setDetailsFetching] = useState(false);
  /** The last answer the detail fetch gave, kept so the card can still show it later. */
  const [detailsOutcome, setDetailsOutcome] = useState(null);
  const [pickedCoords, setPickedCoords] = useState(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  // The travel times as the detail page loaded them, kept here because the map needs the driving
  // route that comes in the same answer. Seeded from the listing so a stored route is drawn without
  // waiting for the request that only refines it.
  const [routeTimes, setRouteTimes] = useState(listing?.travelTimes ?? []);
  // Which route the map draws. Straight line to begin with, because that is the one that needs
  // nothing fetched and so is never missing.
  const [routeMode, setRouteMode] = useState('straight');
  // Everything the map draws a pin and a line for. A saved address is a fixed point and the same one
  // for every listing; a place type has no point of its own, so the supermarket it actually resolved
  // to comes from this listing's own travel times, which is where the sweep recorded it.
  const homeAddresses = useMemo(() => [...savedAddresses, ...placeTargets(routeTimes)], [savedAddresses, routeTimes]);

  useEffect(() => {
    setRouteTimes(listing?.travelTimes ?? []);
  }, [listing?.id, listing?.travelTimes]);

  useEffect(() => {
    document.querySelector('.app__content')?.scrollTo({ top: 0 });
  }, [listingId]);

  useEffect(() => {
    async function fetchListing() {
      try {
        setLoading(true);
        await actions.listingsData.getListing(listingId);
      } catch (e) {
        console.error('Failed to load listing details:', e);
        Toast.error(t('listing.detail.toastLoadError'));
        navigate('/listings');
      } finally {
        setLoading(false);
      }
    }
    fetchListing();
  }, [listingId]);

  useEffect(() => {
    setNotesDraft(listing?.notes ?? '');
  }, [listing?.id, listing?.notes]);

  // The verdict belongs to the listing that was on screen when it was fetched, not to the page.
  useEffect(() => {
    setDetailsOutcome(null);
  }, [listingId]);

  // Fetched separately from the listing rather than joined onto it: most views never draw the
  // chart, and a series has no size bound, so it must not ride along on every listing read.
  useEffect(() => {
    let cancelled = false;
    async function fetchPriceHistory() {
      try {
        // xhrGet resolves { status, json }, not the payload itself.
        const { json } = await xhrGet(`/api/listings/${listingId}/priceHistory`);
        if (!cancelled) setPriceHistory(Array.isArray(json) ? json : []);
      } catch {
        // A missing history is not an error worth interrupting the page for - the chart simply
        // does not render.
        if (!cancelled) setPriceHistory([]);
      }
    }
    fetchPriceHistory();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const hasGeo =
    listing?.latitude != null && listing?.longitude != null && listing?.latitude !== -1 && listing?.longitude !== -1;

  /**
   * Two very different reasons a listing has no position, which used to share one sentence.
   *
   * NULL means nobody has managed to look it up yet: the lookup at scrape time is best effort, and a
   * timeout or a rate limit leaves it empty until the next sweep. That is temporary and worth
   * retrying, and telling somebody their listing "has no valid geocoordinates" while its address sits
   * on the same screen reads as a claim about the listing rather than about Fredy (issue #418).
   *
   * -1 is the geocoder's "looked, found nothing". That one really is about the address, it will not
   * fix itself, and the way out is the pin drop rather than another lookup.
   */
  const geoUnresolved = !hasGeo && listing?.latitude === -1;

  // Null for a listing Fredy could not place, which is what hides the block on the page.
  const lagecheckHref = lagecheckUrl(listing ?? {});

  // Where the map opens. Without coordinates - the case pin dropping exists for - the user's own
  // reference address is the best guess at the right part of the country; failing that, the map's
  // own default view of Germany.
  const mapCenter = hasGeo
    ? [listing.longitude, listing.latitude]
    : homeAddresses.length > 0
      ? [homeAddresses[0].coords.lng, homeAddresses[0].coords.lat]
      : undefined;

  // Escape steps out of pin dropping first; the map keeps its own Escape for collapsing, which the
  // next press then reaches.
  useEffect(() => {
    if (!pinDrop) return undefined;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setPinDrop(null);
      setPickedCoords(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pinDrop]);

  const handleMapReady = useCallback((mapInstance) => {
    map.current = mapInstance;
    setMapReady(true);
  }, []);

  // Everything drawn on top of the shared map: the listing, the reference addresses and the lines
  // between them. The map itself is no longer created or destroyed here, so this only ever adds and
  // removes its own markers.
  useEffect(() => {
    if (!mapReady || !map.current || !listing || !hasGeo) return undefined;

    const mapInstance = map.current;
    const markers = [];

    markers.push(
      new maplibregl.Marker({ color: '#3FB1CE' })
        .setLngLat([listing.longitude, listing.latitude])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<h4>${t('listing.detail.mapPopupListingLocation')}</h4><p>${listing.address}</p>`,
          ),
        )
        .addTo(mapInstance),
    );

    homeAddresses.forEach((home) => {
      markers.push(
        new maplibregl.Marker({ color: HOME_MARKER_COLOR })
          .setLngLat([home.coords.lng, home.coords.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 25 }).setHTML(
              `<h4>${home.label || t('listing.detail.mapPopupHomeAddress')}</h4><p>${home.address}</p>`,
            ),
          )
          .addTo(mapInstance),
      );
    });

    if (homeAddresses.length > 0) {
      const bounds = getBoundsFromCoords([
        [listing.longitude, listing.latitude],
        ...homeAddresses.map((home) => [home.coords.lng, home.coords.lat]),
      ]);
      mapInstance.fitBounds(bounds, { padding: 50, maxZoom: 15 });
    } else {
      // The map is built once and kept, so moving to another listing has to move the camera - the
      // constructor's center belongs to whichever listing was open first.
      mapInstance.jumpTo({ center: [listing.longitude, listing.latitude], zoom: 14 });
    }

    // `styledata` rather than a one-shot `load`: switching the basemap drops every custom source
    // and layer, and the route has to come back with the new style. `applyRouteLayers` is
    // idempotent for exactly that reason.
    const drawRoute = () =>
      applyRouteLayers(mapInstance, buildRouteData(listing, homeAddresses, routeTimes, routeMode));
    if (mapInstance.isStyleLoaded()) drawRoute();
    mapInstance.on('styledata', drawRoute);

    return () => {
      markers.forEach((marker) => marker.remove());
      mapInstance.off('styledata', drawRoute);
    };
  }, [mapReady, listing, homeAddresses, routeTimes, routeMode, hasGeo, t]);

  const confirmDeletion = async (hardDelete, remember) => {
    try {
      if (remember) {
        await actions.userSettings.setListingDeletionPreference({ skipPrompt: true, hardDelete });
      }
      await xhrDelete('/api/listings/', { ids: [listing.id], hardDelete });
      Toast.success(t('listing.detail.toastDeleted'));
      navigate('/listings');
    } catch (e) {
      Toast.error(errorMessage(e, t('listing.detail.toastDeleteError')));
    } finally {
      setDeleteModalVisible(false);
    }
  };

  const requestDeletion = () => {
    if (listingDeletionPref?.skipPrompt) {
      confirmDeletion(listingDeletionPref.hardDelete);
      return;
    }
    setDeleteModalVisible(true);
  };

  const handleWatch = async () => {
    try {
      await xhrPost('/api/listings/watch', { listingId: listing.id });
      Toast.success(
        listing.isWatched === 1 ? t('listing.detail.toastWatchlistRemoved') : t('listing.detail.toastWatchlistAdded'),
      );
      actions.listingsData.getListing(listingId);
    } catch (e) {
      console.error('Failed to operate Watchlist:', e);
      Toast.error(t('listing.detail.toastWatchlistError'));
    }
  };

  const handleReactivate = async () => {
    try {
      await actions.listingsData.reactivateListings([listing.id]);
      await actions.listingsData.getListing(listingId);
      Toast.success(t('listings.toastReactivated'));
    } catch (e) {
      console.error('Failed to reactivate listing:', e);
      Toast.error(t('listings.toastReactivateError'));
    }
  };

  const handleStatusChange = async (next) => {
    try {
      await actions.listingsData.setListingStatus(listing.id, next);
      await actions.listingsData.getListing(listingId);
      Toast.success(next ? t('listings.toastStatusMarked', { status: next }) : t('listings.toastStatusCleared'));
    } catch (e) {
      console.error('Failed to update status:', e);
      Toast.error(t('listings.toastStatusUpdateError'));
    }
  };

  const handleSaveNotes = async () => {
    if (!listing) return;
    setNotesSaving(true);
    try {
      await actions.listingsData.setListingNotes(listing.id, notesDraft);
      await actions.listingsData.getListing(listingId);
      Toast.success(t('listing.detail.toastNotesSaved'));
    } catch (e) {
      console.error('Failed to save notes:', e);
      Toast.error(t('listing.detail.toastNotesError'));
    } finally {
      setNotesSaving(false);
    }
  };

  /**
   * Store an address the user picked, then re-read the listing so map, distances and the nearby
   * stops all move to the new position.
   *
   * @param {{address: string, latitude: number, longitude: number}} position
   */
  const saveAddress = async (position) => {
    try {
      await actions.listingsData.setListingAddress(listingId, position);
      await actions.listingsData.getListing(listingId);
      Toast.success(t('listing.detail.toastAddressSaved'));
    } catch (error) {
      Toast.error(errorMessage(error, t('listing.detail.toastAddressError')));
      throw error;
    }
  };

  /**
   * Ask for this listing's coordinates again.
   *
   * The lookup at scrape time is best effort, so a timeout or a rate limit leaves a listing with an
   * address on screen and nothing on the map. Until this button, the only remedy was the six-hourly
   * sweep, or the trick of opening Settings and pressing Save (issue #418).
   *
   * Each answer gets its own message, because they ask for different things: wait, fix the address,
   * or nothing at all.
   */
  const retryGeocoding = async () => {
    setGeocodeRetrying(true);
    try {
      const response = await xhrPost(`/api/listings/${listingId}/geocode`, {});
      const status = response?.json?.status;
      if (status === 'found') {
        await actions.listingsData.getListing(listingId);
        Toast.success(t('listing.detail.toastGeoFound'));
      } else if (status === 'unavailable') {
        Toast.warning(t('listing.detail.toastGeoUnavailable'));
      } else {
        Toast.warning(t('listing.detail.toastGeoNotFound'));
      }
    } catch (error) {
      Toast.error(errorMessage(error, t('listing.detail.toastGeoError')));
    } finally {
      setGeocodeRetrying(false);
    }
  };

  /**
   * Read this one listing's detail page now.
   *
   * Deliberately not gated on the user's `provider_details` setting: that one governs the sweep
   * that visits every newly found listing, and this is somebody asking for one exposé by hand.
   *
   * Every answer is kept on the card rather than only announced, because "this portal has no detail
   * page" is a lasting fact about the listing and a toast that has faded takes it away.
   */
  const fetchDetails = async () => {
    setDetailsFetching(true);
    try {
      const response = await xhrPost(`/api/listings/${listingId}/details`, {});
      const status = response?.json?.status ?? null;
      setDetailsOutcome(status);
      if (status === 'updated') {
        await actions.listingsData.getListing(listingId);
        Toast.success(t('listing.detail.refetchUpdated'));
      }
    } catch (error) {
      setDetailsOutcome('failed');
      Toast.error(errorMessage(error, t('listing.detail.refetchFailed')));
    } finally {
      setDetailsFetching(false);
    }
  };

  /**
   * Hand over from "no such address" to putting the listing on the map by hand. The map is expanded
   * for it: picking a building out of a 400px panel is not a fair ask.
   *
   * @param {string} address - What the user typed, kept as the address text.
   */
  const startPinDrop = (address) => {
    setPinDrop({ address });
    setPickedCoords(null);
    setMapExpanded(true);
  };

  const cancelPinDrop = () => {
    setPinDrop(null);
    setPickedCoords(null);
  };

  const savePinnedAddress = async () => {
    if (!pinDrop || !pickedCoords) return;
    setPinSaving(true);
    try {
      await saveAddress({ address: pinDrop.address, latitude: pickedCoords.lat, longitude: pickedCoords.lng });
      cancelPinDrop();
      setMapExpanded(false);
    } catch {
      // saveAddress already told the user; staying in pin mode lets them try again.
    } finally {
      setPinSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="listing-detail__loading">
        <Spin size="large" />
      </div>
    );
  }

  if (!listing) return null;

  const isRental = listing.dealType === 'rent';
  const financeIncomplete = !(isRental ? rentComplete : buyComplete) && listing.price != null;

  return (
    <div className={`listing-detail${phone ? ' listing-detail--phone' : ''}`}>
      {/* Before everything, full width. Somebody who is about to be defrauded should meet the
          warning before they start liking the flat, and a warning that sits below the fold in one
          of two columns is not a warning. */}
      <div className="listing-detail__scam">
        <ScamPanel listing={listing} onChange={() => actions.listingsData.getListing(listingId)} />
      </div>

      <ListingActionBar
        listing={listing}
        onBack={() => navigate(-1)}
        onWatch={handleWatch}
        onApply={() => setApplicationVisible(true)}
        onDelete={requestDeletion}
        onReactivate={handleReactivate}
      />

      {/* The ad is gone from the portal. Said once here rather than only implied by a menu entry
          the reader has to open to find. */}
      {listing.is_active === 0 && (
        <div className="listing-detail__inactive">
          <Banner type="info" bordered closeIcon={null} description={t('listing.detail.inactiveHint')} />
        </div>
      )}

      <ListingTitleBlock
        listing={listing}
        wide={wide}
        onSaveAddress={saveAddress}
        onPickOnMap={startPinDrop}
        onStatusChange={handleStatusChange}
      />

      <div className="listing-detail__grid">
        <div className="listing-detail__main">
          <section className="listing-detail__media listing-detail__sec--media">
            <div className={`listing-detail__image${!listing.image_url ? ' listing-detail__image--placeholder' : ''}`}>
              <Image
                src={listing.image_url ?? no_image}
                fallback={<img src={no_image} alt={t('listing.detail.noImageAlt')} />}
                alt={listing.title || t('listing.detail.defaultTitle')}
                style={{ width: '100%', height: '100%' }}
                preview={listing.image_url ? { visible: imagePreview, onVisibleChange: setImagePreview } : false}
              />
              {/* A plain button rather than a Semi one: it sits on a photograph, so its colours
                  are the scrim's and not the theme's, and fighting a component's own palette with
                  `!important` to get there is the worse trade. */}
              {listing.image_url && (
                <button
                  type="button"
                  className="listing-detail__image-expand"
                  aria-label={t('listing.detail.expandImage')}
                  onClick={() => setImagePreview(true)}
                >
                  <IconMaximize aria-hidden="true" />
                </button>
              )}
            </div>
            {!listing.image_url && (
              <Text type="tertiary" size="small" className="listing-detail__image-note">
                {t('listing.detail.noImageAlt')}
              </Text>
            )}
          </section>

          <div className="listing-detail__sec--description">
            <PhoneCollapse
              enabled={phone}
              title={t('listing.detail.descriptionTitle')}
              hint={listing.description ? undefined : t('listing.detail.noDescription')}
            >
              <ListingDescriptionCard
                listing={listing}
                onRefetch={fetchDetails}
                refetching={detailsFetching}
                outcome={detailsOutcome}
              />
            </PhoneCollapse>
          </div>

          <div className="listing-detail__sec--location">
            <ListingLocationCard
              listing={listing}
              hasGeo={hasGeo}
              geoUnresolved={geoUnresolved}
              countries={countries}
              mapCenter={mapCenter}
              mapExpanded={mapExpanded}
              onExpandedChange={setMapExpanded}
              pinDrop={pinDrop}
              pickedCoords={pickedCoords}
              onPick={setPickedCoords}
              pinSaving={pinSaving}
              onSavePin={savePinnedAddress}
              onCancelPin={cancelPinDrop}
              onMapReady={handleMapReady}
              geocodeRetrying={geocodeRetrying}
              onRetryGeocode={retryGeocoding}
              routeMode={routeMode}
              onRouteModeChange={setRouteMode}
              routeTimes={routeTimes}
              onTravelTimesLoaded={setRouteTimes}
              lagecheckHref={lagecheckHref}
              onLagecheckOpen={() => actions.tracking.trackPoi(pois.LAGECHECK_OPENED)}
            />
          </div>

          <div className="listing-detail__sec--workspace">
            <PhoneCollapse
              enabled={phone}
              title={t('listing.detail.workspaceTitle')}
              hint={notesDraft ? t('listing.detail.notesTitle') : undefined}
            >
              <ListingWorkspace
                listingId={listingId}
                notesDraft={notesDraft}
                onNotesChange={setNotesDraft}
                onSaveNotes={handleSaveNotes}
                notesSaving={notesSaving}
                notesDirty={(notesDraft ?? '') !== (listing.notes ?? '')}
              />
            </PhoneCollapse>
          </div>
        </div>

        <aside className="listing-detail__rail">
          <div className="listing-detail__sec--keyfacts">
            <ListingKeyFacts listing={listing} priceHistory={priceHistory} financeThresholds={financeThresholds} />
          </div>

          <div className="listing-detail__sec--origin">
            <ListingOrigin listing={listing} />
          </div>

          <div className="listing-detail__sec--finance">
            <ListingFinanceCard listing={listing} />

            {/* Without the matching half of the profile there is nothing to compute, so offer the
                way to create it instead of hiding the feature completely. */}
            {financeIncomplete && (
              <section className="listing-card listing-detail__finance-hint">
                <Space align="center" wrap>
                  <IconEuro className="listing-detail__finance-hint-icon" />
                  <Text type="secondary">
                    {t(isRental ? 'listing.detail.rentSetupHint' : 'listing.detail.financeSetupHint')}
                  </Text>
                  <Button
                    theme="borderless"
                    size="small"
                    onClick={() =>
                      navigate(
                        isRental ? '/finance' : `/finance?dealType=buy&price=${listing.price}&listingId=${listing.id}`,
                      )
                    }
                  >
                    {t(isRental ? 'listing.detail.rentSetup' : 'listing.detail.financeCalculate')}
                  </Button>
                </Space>
              </section>
            )}
          </div>

          {/* A narrow list of departures, which is why it belongs beside the map rather than under
              it: given the main column's width it would squeeze the map into half of it. */}
          {hasGeo && (
            <div className="listing-detail__sec--transit">
              <PhoneCollapse enabled={phone} title={t('transit.nearbyTitle')}>
                <section className="listing-card">
                  <h2 className="listing-card__label">{t('transit.nearbyTitle')}</h2>
                  <NearbyStops lat={listing.latitude} lng={listing.longitude} limit={3} expandFirst />
                </section>
              </PhoneCollapse>
            </div>
          )}

          {/* Only shown once the operator has the enrichment on - with it off nothing is ever
              stored, and an empty card would read as a fault rather than a setting. */}
          {hasGeo && connectivityEnabled && (
            <div className="listing-detail__sec--connectivity">
              <PhoneCollapse enabled={phone} title={t('connectivity.title')}>
                <section className="listing-card">
                  <h2 className="listing-card__label">{t('connectivity.title')}</h2>
                  <ConnectivityCard connectivity={listing.connectivity} />
                </section>
              </PhoneCollapse>
            </div>
          )}
        </aside>
      </div>

      <ListingDeletionModal
        visible={deleteModalVisible}
        defaultDeleteType={defaultDeleteType}
        onConfirm={confirmDeletion}
        onCancel={() => setDeleteModalVisible(false)}
      />

      <ApplicationModal
        visible={applicationVisible}
        listingId={listing.id}
        onCancel={() => setApplicationVisible(false)}
        // Copying the letter sets the status, so the segment in the title block has to follow it.
        onApplied={() => actions.listingsData.getListing(listingId)}
      />
    </div>
  );
}
