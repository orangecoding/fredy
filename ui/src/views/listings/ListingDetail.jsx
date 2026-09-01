/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useSelector, useActions } from '../../services/state/store.js';
import {
  Typography,
  Button,
  Space,
  Card,
  Row,
  Col,
  Image,
  Tag,
  Divider,
  Descriptions,
  Banner,
  Spin,
  Toast,
  TextArea,
  Tooltip,
  Select,
} from '@douyinfe/semi-ui-19';
import {
  IconArrowLeft,
  IconMapPin,
  IconCart,
  IconClock,
  IconBriefcase,
  IconActivity,
  IconLink,
  IconStar,
  IconStarStroked,
  IconDelete,
  IconExpand,
  IconGridView,
  IconCalendar,
  IconBolt,
  IconRefresh,
} from '@douyinfe/semi-icons';
import maplibregl from '../../components/map/maplibre.js';
import MapCanvas, { HOME_MARKER_COLOR } from '../../components/map/Map.jsx';
import { useProviderCountries } from '../../hooks/useProviderCountries.js';
import no_image from '../../assets/no_image.png';
import * as timeService from '../../services/time/timeService.js';
import { formatEuroPrice } from '../../services/price/priceService.js';
import { getBoundsFromCoords } from './mapUtils.js';
import { applyRouteLayers, buildRouteData, placeTargets } from './detailMapLayers.js';
import { TRAVEL_MODES } from '../../components/transit/travelTimeFormat.js';
import { getAddresses } from '../../utils.js';
import { xhrPost, xhrGet, xhrDelete, errorMessage } from '../../services/xhr.js';
import ListingDeletionModal from '../../components/ListingDeletionModal.jsx';

import Headline from '../../components/headline/Headline.jsx';
import IconEuro from '../../components/icons/IconEuro.jsx';
import StatusControl from '../../components/listings/StatusControl.jsx';
import ListingFinanceCard from './components/ListingFinanceCard.jsx';
import PriceHistoryChart from './components/PriceHistoryChart.jsx';
import NearbyStops from '../../components/transit/NearbyStops.jsx';
import ConnectivityCard from '../../components/connectivity/ConnectivityCard.jsx';
import TravelTimes from '../../components/transit/TravelTimes.jsx';
import AddressEditor from './components/AddressEditor.jsx';
import './ListingDetail.less';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';
import { useFinanceProfile } from '../../hooks/useFinanceProfile.js';
import { VERDICT_COLORS, formatEuro, withAlpha } from '../../components/cards/chartTheme.js';

const { Title, Text } = Typography;

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
function hasRouteFor(travelTimes, mode) {
  return (Array.isArray(travelTimes) ? travelTimes : []).some((entry) =>
    mode === 'transit' ? (entry.transit?.legs?.length ?? 0) > 0 : Boolean(entry[mode]?.geometry),
  );
}

export default function ListingDetail() {
  const t = useTranslation();
  const locale = useLocale();
  const { listingId } = useParams();
  const navigate = useNavigate();
  const actions = useActions();
  const { isComplete: buyComplete, rentComplete, thresholds: financeThresholds } = useFinanceProfile();
  const listing = useSelector((state) => state.listingsData.currentListing);
  const userSettings = useSelector((state) => state.userSettings.settings);
  const connectivityEnabled = useSelector((state) => state.generalSettings.settings?.connectivityEnabled === true);
  const savedAddresses = useMemo(() => getAddresses(userSettings), [userSettings]);
  const listingDeletionPref = userSettings?.listing_deletion_preference;
  const defaultDeleteType = listingDeletionPref?.hardDelete ? 'hard' : 'soft';
  // The listing does name a provider, but the pin can be dragged anywhere the user's own searches
  // reach, so the map takes the same account-wide union the listings map does.
  const countries = useProviderCountries();
  const map = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [priceHistory, setPriceHistory] = useState([]);
  // Set while the user is placing the listing by hand: carries the address text they typed, waiting
  // for the coordinates the map is about to give it.
  const [pinDrop, setPinDrop] = useState(null);
  /** Whether a manual "try again" lookup is in flight, so the button can say so. */
  const [geocodeRetrying, setGeocodeRetrying] = useState(false);
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!listing) return null;

  const statusKeyMap = {
    applied: 'listing.detail.statusApplied',
    accepted: 'listing.detail.statusAccepted',
    rejected: 'listing.detail.statusRejected',
  };
  const statusLabel = listing.status?.status ? t(statusKeyMap[listing.status.status] ?? listing.status.status) : null;

  const data = [
    {
      key: t('listing.detail.fieldPrice'),
      value: listing.price ? (
        <span className="listing-detail__price">{formatEuroPrice(listing.price, locale)}</span>
      ) : (
        t('common.na')
      ),
      Icon: <IconCart />,
      helpText: t('listing.detail.fieldPriceHelp'),
    },
    {
      key: t('listing.detail.fieldSize'),
      value: listing.size ? `${listing.size} m²` : t('common.na'),
      Icon: <IconExpand />,
      helpText: t('listing.detail.fieldSizeHelp'),
    },
    {
      key: t('listing.detail.fieldRooms'),
      value: listing.rooms ? t('listing.detail.fieldRoomsValue', { count: listing.rooms }) : t('common.na'),
      Icon: <IconGridView />,
      helpText: t('listing.detail.fieldRoomsHelp'),
    },
    {
      key: t('listing.detail.fieldJob'),
      value: listing.job_name,
      Icon: <IconBriefcase />,
      helpText: t('listing.detail.fieldJobHelp'),
    },
    {
      key: t('listing.detail.fieldProvider'),
      value: listing.provider ? listing.provider.charAt(0).toUpperCase() + listing.provider.slice(1) : 'Unknown',
      Icon: <IconBriefcase />,
      helpText: t('listing.detail.fieldProviderHelp'),
    },
    {
      key: t('listing.detail.fieldAdded'),
      value: timeService.format(listing.created_at, true, locale),
      Icon: <IconClock />,
      helpText: t('listing.detail.fieldAddedHelp'),
    },
  ];

  // Only the detail page states these, and only for a part of the listings, so they are pushed
  // rather than shown as another "N/A" next to the figures every listing carries.
  if (listing.build_year) {
    data.push({
      key: t('listing.detail.fieldBuildYear'),
      value: listing.build_year,
      Icon: <IconCalendar />,
      helpText: t('listing.detail.fieldBuildYearHelp'),
    });
  }

  if (listing.energy_class) {
    data.push({
      key: t('listing.detail.fieldEnergyClass'),
      value: listing.energy_class,
      Icon: <IconBolt />,
      helpText: t('listing.detail.fieldEnergyClassHelp'),
    });
  }

  // The verdict belongs next to the price, not only in the costing block further down. It comes
  // with the listing from the server, decided against the same profile and thresholds the
  // affordability filter uses, so this page can never disagree with the row the user clicked.
  const affordabilityVerdict = listing.affordabilityVerdict ?? null;
  const isRental = listing.dealType === 'rent';

  if (affordabilityVerdict) {
    data.push({
      key: t('listing.detail.fieldAffordability'),
      value: (
        <span
          className="listing-detail__affordability"
          style={{
            color: VERDICT_COLORS[affordabilityVerdict],
            backgroundColor: withAlpha(VERDICT_COLORS[affordabilityVerdict], 0.12),
            borderColor: withAlpha(VERDICT_COLORS[affordabilityVerdict], 0.4),
          }}
        >
          {t(`finance.verdict.${affordabilityVerdict}`)}
        </span>
      ),
      Icon: <IconEuro />,
      helpText: t(
        `listings.${isRental ? 'rentAffordabilityTooltip' : 'affordabilityTooltip'}.${affordabilityVerdict}`,
        {
          price: formatEuro(
            isRental ? financeThresholds.rent.affordableMaxRent : financeThresholds.buy.affordableMaxPrice,
            locale,
          ),
        },
      ),
    });
  }

  if (statusLabel) {
    data.push({
      key: t('listing.detail.fieldStatus'),
      value: listing.status?.setAt
        ? `${statusLabel} ${t('listing.detail.statusSetAt', { date: timeService.format(listing.status.setAt, true, locale) })}`
        : statusLabel,
      Icon: <IconActivity />,
      helpText: t('listing.detail.fieldStatusHelp'),
    });
  }

  return (
    <div className="listing-detail">
      <Headline
        text={listing?.title || t('listing.detail.defaultTitle')}
        actions={
          <Button
            icon={<IconArrowLeft />}
            onClick={() => navigate(-1)}
            theme="borderless"
            style={{ color: 'var(--f-muted)' }}
          >
            {t('listing.detail.back')}
          </Button>
        }
      />

      <Card className="listing-detail__card">
        <div className="listing-detail__header">
          <Space align="center">
            <IconMapPin style={{ fontSize: '18px', color: 'var(--semi-color-primary)' }} />
            {listing.address ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(listing.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="listing-detail__address-link"
              >
                {listing.address}
              </a>
            ) : (
              <Text type="secondary">{t('listing.detail.noAddress')}</Text>
            )}
            <AddressEditor isManual={listing.address_is_manual === 1} onSave={saveAddress} onPickOnMap={startPinDrop} />
          </Space>
          <Space wrap className="listing-detail__header-actions">
            <Button
              icon={listing.isWatched === 1 ? <IconStar /> : <IconStarStroked />}
              onClick={handleWatch}
              theme="borderless"
              className={`listing-detail__watch-btn${listing.isWatched === 1 ? ' listing-detail__watch-btn--active' : ''}`}
            >
              {listing.isWatched === 1 ? t('listing.detail.watched') : t('listing.detail.watch')}
            </Button>
            <StatusControl status={listing.status?.status ?? null} onChange={handleStatusChange} />
            <a href={listing.link} target="_blank" rel="noopener noreferrer" className="listing-detail__open-btn">
              <IconLink style={{ marginRight: 6 }} />
              {t('listing.detail.openListing')}
            </a>
            {/* Sits next to "open listing" on purpose: the user clicks that first, sees the ad is
                very much alive, and the correction is the next button along. */}
            {listing.is_active === 0 && (
              <Button icon={<IconRefresh />} onClick={handleReactivate} theme="light" type="secondary">
                {t('listing.detail.reactivate')}
              </Button>
            )}
            <Button
              icon={<IconDelete />}
              onClick={() => {
                if (listingDeletionPref?.skipPrompt) {
                  confirmDeletion(listingDeletionPref.hardDelete);
                  return;
                }
                setDeleteModalVisible(true);
              }}
              theme="light"
              type="danger"
            >
              {t('listing.detail.delete')}
            </Button>
          </Space>
        </div>

        <Row>
          <Col span={24} lg={12}>
            <div
              className={`listing-detail__image-container${!listing.image_url ? ' listing-detail__image-container--placeholder' : ''}`}
            >
              <Image
                src={listing.image_url ?? no_image}
                fallback={<img src={no_image} alt={t('listing.detail.noImageAlt')} />}
                style={{ width: '100%', height: '100%' }}
                preview={!!listing.image_url}
              />
            </div>

            <div className="listing-detail__notes">
              <Title heading={4} className="listing-detail__notes-title">
                {t('listing.detail.notesTitle')}
              </Title>
              <TextArea
                value={notesDraft}
                onChange={(val) => setNotesDraft(val)}
                placeholder={t('listing.detail.notesPlaceholder')}
                rows={5}
                autosize={{ minRows: 4, maxRows: 12 }}
                className="listing-detail__notes-textarea"
                showClear
              />
              <Space className="listing-detail__notes-actions">
                <Button
                  theme="solid"
                  type="primary"
                  loading={notesSaving}
                  disabled={notesSaving || (notesDraft ?? '') === (listing.notes ?? '')}
                  onClick={handleSaveNotes}
                >
                  {t('listing.detail.storeNotes')}
                </Button>
              </Space>
            </div>

            {/* The map used to run the full width under the card, which pushed it a screen
                below the figures. In this column it sits beside the details and the costing,
                so the whole listing fits on one screen. */}
            <div className="listing-detail__map-wrapper">
              <Title heading={4} className="listing-detail__map-title">
                {t('listing.detail.locationTitle')}
              </Title>
              {/* A listing with no coordinates normally gets a warning instead of a map - but those
                  are exactly the ones somebody wants to place by hand, so pin dropping brings the
                  map out anyway. */}
              {!hasGeo && !pinDrop ? (
                <Banner
                  type="warning"
                  bordered
                  description={
                    <div className="listing-detail__noGeo">
                      <span>{geoUnresolved ? t('listing.detail.noGeoWarning') : t('listing.detail.noGeoPending')}</span>
                      {/* Only for the temporary case. Offering "try again" for an address the
                          geocoder has already rejected would be offering the same answer twice. */}
                      {!geoUnresolved && (
                        <Button size="small" loading={geocodeRetrying} onClick={retryGeocoding}>
                          {t('listing.detail.geoRetry')}
                        </Button>
                      )}
                    </div>
                  }
                />
              ) : (
                <div className="listing-detail__map-container">
                  {/* Public transport on by default: the first question about any flat is how to
                      get out of it, and the answer should already be on screen. */}
                  <MapCanvas
                    countries={countries}
                    initialCenter={mapCenter}
                    initialZoom={hasGeo ? 14 : 10}
                    defaultShowTransit
                    cooperativeGestures
                    expanded={mapExpanded}
                    onExpandedChange={setMapExpanded}
                    pickMode={pinDrop != null}
                    onPick={setPickedCoords}
                    onMapReady={handleMapReady}
                  >
                    {pinDrop != null && (
                      <div className="listing-detail__pin-bar">
                        <div className="listing-detail__pin-bar-text">
                          <Text>
                            {pickedCoords ? t('listing.detail.pinDropPicked') : t('listing.detail.pinDropHint')}
                          </Text>
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
                          onClick={savePinnedAddress}
                        >
                          {t('listing.detail.pinDropSave')}
                        </Button>
                        <Button size="small" theme="borderless" onClick={cancelPinDrop}>
                          {t('common.cancel')}
                        </Button>
                      </div>
                    )}
                  </MapCanvas>
                </div>
              )}
            </div>

            {/* "How do I get out of here?" belongs right next to the map, and only makes sense
                once the listing has coordinates to look up. */}
            {hasGeo && (
              <div className="listing-detail__transit">
                <Title heading={4} className="listing-detail__map-title">
                  {t('transit.nearbyTitle')}
                </Title>
                <NearbyStops lat={listing.latitude} lng={listing.longitude} limit={3} expandFirst />
              </div>
            )}
          </Col>
          <Col span={24} lg={12}>
            <div className="listing-detail__info-section">
              <Title heading={4} style={{ marginBottom: '1rem' }}>
                {t('listing.detail.detailsTitle')}
              </Title>
              <Descriptions column={1}>
                {data.map((item, index) => (
                  <Descriptions.Item key={index}>
                    <Tooltip content={item.helpText} position="left">
                      <span className="listing-detail__details-item">
                        {item.Icon}
                        {item.value}
                      </span>
                    </Tooltip>
                  </Descriptions.Item>
                ))}
              </Descriptions>

              {/* Directly under the figures it explains. The chart hides itself below two
                  readings, so a listing whose price has never moved shows nothing at all rather
                  than an empty frame. */}
              {priceHistory.length >= 2 && (
                <>
                  <Divider margin="1.5rem" />
                  <Title heading={6} style={{ marginBottom: '0.75rem' }}>
                    {t('listing.detail.priceHistory')}
                  </Title>
                  <PriceHistoryChart data={priceHistory} locale={locale} />
                </>
              )}

              {/* The costing answers "can I have this?", which is the question asked right
                  after the price - so it comes before the sales copy, not after it. */}
              <ListingFinanceCard listing={listing} />

              {/* Without the matching half of the profile there is nothing to compute, so offer
                  the way to create it instead of hiding the feature completely. */}
              {!(isRental ? rentComplete : buyComplete) && listing.price != null && (
                <>
                  <Divider margin="1.5rem" />
                  <Space align="center" wrap>
                    <IconEuro style={{ fontSize: '18px', color: 'var(--semi-color-primary)' }} />
                    <Text type="secondary">
                      {t(isRental ? 'listing.detail.rentSetupHint' : 'listing.detail.financeSetupHint')}
                    </Text>
                    <Button
                      theme="borderless"
                      size="small"
                      onClick={() =>
                        navigate(
                          isRental
                            ? '/finance'
                            : `/finance?dealType=buy&price=${listing.price}&listingId=${listing.id}`,
                        )
                      }
                    >
                      {t(isRental ? 'listing.detail.rentSetup' : 'listing.detail.financeCalculate')}
                    </Button>
                  </Space>
                </>
              )}

              <Divider margin="1.5rem" />
              <Title heading={4} style={{ marginBottom: '1rem' }}>
                {t('listing.detail.descriptionTitle')}
              </Title>
              <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                {listing.description || t('listing.detail.noDescription')}
              </Text>

              {Array.isArray(listing.distances) && listing.distances.length > 0 && (
                <>
                  <Divider margin="1.5rem" />
                  <Space align="center" wrap>
                    <IconActivity style={{ fontSize: '18px', color: 'var(--semi-color-primary)' }} />
                    <Text strong>{t('listing.detail.distanceToHome')}</Text>
                    {listing.distances.map((d) => (
                      <Tag color="blue" key={d.label}>
                        {d.label}: {d.meters} m
                      </Tag>
                    ))}
                  </Space>
                </>
              )}

              {/* Right below the straight-line distances, because the two answer the same question
                  and the second one is the honest answer. It loads on its own: a listing found
                  minutes ago has not been routed yet, and this is where somebody would look. */}
              {listing.latitude != null && listing.longitude != null && (
                <>
                  <Divider margin="1.5rem" />
                  <Text strong style={{ display: 'block', marginBottom: '0.5rem' }}>
                    {t('travelTime.title')}
                  </Text>
                  <TravelTimes
                    listingId={listing.id}
                    travelTimes={listing.travelTimes}
                    refine
                    onLoaded={setRouteTimes}
                  />

                  {/* Sits under the times rather than on the map: it is the same question the
                      numbers above answer, only drawn. A mode with no route stored falls back to
                      the straight line, and says so. */}
                  <div className="listingDetail__routePicker">
                    <Text size="small" type="tertiary">
                      {t('listing.detail.routeLabel')}
                    </Text>
                    <Select size="small" style={{ width: 170 }} value={routeMode} onChange={setRouteMode}>
                      <Select.Option value="straight">{t('listing.detail.routeStraight')}</Select.Option>
                      {TRAVEL_MODES.map((mode) => (
                        <Select.Option key={mode.key} value={mode.key}>
                          {mode.icon} {t(mode.labelKey)}
                        </Select.Option>
                      ))}
                    </Select>
                    {routeMode !== 'straight' && !hasRouteFor(routeTimes, routeMode) && (
                      <Text size="small" type="tertiary">
                        {t('listing.detail.routeMissing')}
                      </Text>
                    )}
                  </div>
                </>
              )}

              {/* Under the travel times because it belongs to the same half of the page: both are
                  things Fredy worked out about the address rather than things the portal said about
                  the flat, and somebody weighing up a place reads them together. Only shown once
                  the operator has the enrichment on - with it off nothing is ever stored, and an
                  empty card would read as a fault rather than a setting. */}
              {hasGeo && connectivityEnabled && (
                <>
                  <Divider margin="1.5rem" />
                  <Text strong style={{ display: 'block', marginBottom: '0.5rem' }}>
                    {t('connectivity.title')}
                  </Text>
                  <ConnectivityCard connectivity={listing.connectivity} />
                </>
              )}
            </div>
          </Col>
        </Row>
      </Card>

      <ListingDeletionModal
        visible={deleteModalVisible}
        defaultDeleteType={defaultDeleteType}
        onConfirm={confirmDeletion}
        onCancel={() => setDeleteModalVisible(false)}
      />
    </div>
  );
}
