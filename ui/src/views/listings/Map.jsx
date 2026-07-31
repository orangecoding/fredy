/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useUrlState, parseNumber, parseString, parseBoolean } from '../../hooks/useSearchParamState.js';
import { getAddresses } from '../../utils.js';
import maplibregl from '../../components/map/maplibre.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useActions, useSelector } from '../../services/state/store.js';
import {
  distanceMeters,
  generateCircleCoords,
  getBoundsFromCenter,
  getBoundsFromCoords,
  groupListingsByPosition,
} from './mapUtils.js';
import { Banner, Select, Switch, Toast, Typography } from '@douyinfe/semi-ui-19';

import _RangeSlider from 'react-range-slider-input';
import 'react-range-slider-input/dist/style.css';
import './Map.less';
import { xhrDelete, errorMessage } from '../../services/xhr.js';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ListingDeletionModal from '../../components/ListingDeletionModal.jsx';
import { createListingPopupContent } from './listingPopupContent.jsx';
import Map from '../../components/map/Map.jsx';
import Headline from '../../components/headline/Headline.jsx';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { TRANSIT_STOPS_LAYER_ID } from '../../components/map/overlayLayers.js';
import { keepPopupInView, mountPopupNode } from '../../components/map/popupContent.jsx';
import DeparturesBoard from '../../components/transit/DeparturesBoard.jsx';
import NearbyStops from '../../components/transit/NearbyStops.jsx';

/**
 * The map's URL-backed view state: which job, the distance ring, the basemap and the optional
 * overlays (3D buildings, public transport).
 *
 * Module scope so its identity is stable for the hook's memo.
 */
const MAP_URL_STATE = {
  job: { defaultValue: null, codec: parseString },
  distance: { defaultValue: 0, codec: parseNumber },
  style: { defaultValue: 'STANDARD', codec: parseString },
  buildings: { defaultValue: false, codec: parseBoolean },
  // On by default: "how do I get out of here?" is asked about every flat, so the answer should be
  // on screen without switching anything on first. `?transit=false` turns it off.
  transit: { defaultValue: true, codec: parseBoolean },
};

/**
 * Upper bound for a listing popup. It carries an image, five rows of details and the nearby stops,
 * which MapLibre's 240px default squeezes into an unreadable column; the stylesheet narrows it
 * again on phones.
 */
const LISTING_POPUP_MAX_WIDTH = '380px';

const RangeSlider = _RangeSlider?.default ?? _RangeSlider;

const { Text } = Typography;

export default function MapView() {
  const t = useTranslation();
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const homeMarkers = useRef([]);
  // Every React tree mounted into a popup, so they can be torn down with their markers.
  const popupRoots = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const actions = useActions();
  const navigate = useNavigate();
  const sp = useSearchParams();
  const [searchParams, setSearchParams] = sp;
  const listings = useSelector((state) => state.listingsData.mapListings);
  const userSettings = useSelector((state) => state.userSettings.settings);
  const homeAddresses = useMemo(() => getAddresses(userSettings), [userSettings]);
  const language = userSettings?.language ?? 'en';
  const listingDeletionPref = userSettings?.listing_deletion_preference;
  const defaultDeleteType = listingDeletionPref?.hardDelete ? 'hard' : 'soft';

  const jobs = useSelector((state) => state.jobsData.jobs);
  // One grouped state rather than four independent setters: two of these can change in the same
  // tick, and separate setSearchParams calls overwrite each other.
  const { values: urlState, setValue: setUrlValue } = useUrlState(sp, MAP_URL_STATE);
  const { job: jobId, distance: distanceFilter, style, buildings: show3dBuildings, transit: showTransit } = urlState;
  const setJobId = (value) => setUrlValue('job', value);
  const setDistanceFilter = (value) => setUrlValue('distance', value);
  const setShow3dBuildings = (value) => setUrlValue('buildings', value);
  const setShowTransit = (value) => setUrlValue('transit', value);

  // Price range: stored as priceMin/priceMax URL params; default max derived from loaded listings
  const urlPriceMin = searchParams.has('priceMin') ? Number(searchParams.get('priceMin')) : null;
  const urlPriceMax = searchParams.has('priceMax') ? Number(searchParams.get('priceMax')) : null;
  const [priceRange, setPriceRange] = useState([urlPriceMin ?? 0, urlPriceMax ?? 0]);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [listingToDelete, setListingToDelete] = useState(null);
  const deleteListingRef = useRef(null);

  const confirmListingDeletion = async (hardDelete, remember, id = listingToDelete) => {
    try {
      if (remember) {
        await actions.userSettings.setListingDeletionPreference({ skipPrompt: true, hardDelete });
      }
      await xhrDelete('/api/listings/', { ids: [id], hardDelete });
      Toast.success(t('map.toastDeleted'));
      fetchListings();
    } catch (error) {
      Toast.error(errorMessage(error, t('map.toastDeleteError')));
    } finally {
      setDeleteModalVisible(false);
      setListingToDelete(null);
    }
  };

  deleteListingRef.current = (id) => {
    if (listingDeletionPref?.skipPrompt) {
      confirmListingDeletion(listingDeletionPref.hardDelete, false, id);
      return;
    }
    setListingToDelete(id);
    setDeleteModalVisible(true);
  };

  useEffect(() => {
    // Only reset to full range when no URL override is set
    if (urlPriceMax === null) {
      setPriceRange([0, getMaxPrice()]);
    }
  }, [listings]);

  const getMaxPrice = () => {
    return listings.reduce((acc, item) => {
      const price = Number(item.price);
      return Number.isFinite(price) && price > acc ? price : acc;
    }, 0);
  };

  const filterListings = () => {
    const min = priceRange[0];
    const max = priceRange[1] && priceRange[1] > 0 ? priceRange[1] : getMaxPrice();

    return listings.filter((listing) => listing.price && listing.price >= min && listing.price <= max);
  };

  useEffect(() => {
    window.deleteListing = (id) => deleteListingRef.current(id);

    window.viewDetails = (id) => {
      navigate(`/listings/listing/${id}`);
    };

    return () => {
      delete window.deleteListing;
      delete window.viewDetails;
    };
  }, [navigate]);

  useEffect(() => {
    if (mapContainer.current && !map.current) {
      const checkMapReady = () => {
        if (mapContainer.current?.map) {
          map.current = mapContainer.current.map;
        } else {
          setTimeout(checkMapReady, 100);
        }
      };
      checkMapReady();
    }
  }, []);

  const handleMapReady = (mapInstance) => {
    map.current = mapInstance;
    setMapReady(true);
  };

  // Hovering a stop of the transit overlay opens its departure board; a click does the same, so
  // touch devices are not left out. The stop icons come from the vector tiles and carry
  // OpenStreetMap ids, which mean nothing to a timetable - the backend resolves the stop from the
  // coordinates and the name instead.
  useEffect(() => {
    if (!mapReady || !map.current || !showTransit) return undefined;

    const mapInstance = map.current;
    /** @type {{popup: import('maplibre-gl').Popup, key: string}|null} */
    let open = null;
    let closeTimer = null;

    const cancelClose = () => {
      clearTimeout(closeTimer);
      closeTimer = null;
    };

    const closeNow = () => {
      cancelClose();
      open?.popup.remove();
      open = null;
    };

    // A small grace period, so moving the pointer from the icon onto the popup does not close it.
    const scheduleClose = () => {
      cancelClose();
      closeTimer = setTimeout(closeNow, 250);
    };

    const openDepartures = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;

      const [lng, lat] = feature.geometry.coordinates;
      const name = feature.properties?.name;
      const key = `${lng},${lat},${name ?? ''}`;

      cancelClose();
      if (open?.key === key) return; // already showing this stop
      closeNow();

      const container = document.createElement('div');
      container.className = 'map-popup-content map-popup-content--transit';
      const unmount = mountPopupNode(
        container,
        <DeparturesBoard lat={lat} lng={lng} name={name} showStopName limit={8} />,
        language,
      );

      const popup = new maplibregl.Popup({
        offset: 14,
        maxWidth: '300px',
        // It follows the pointer, so a close button would only be in the way, and closing it on
        // every map click would fight the hover.
        closeButton: false,
        closeOnClick: false,
      })
        .setLngLat([lng, lat])
        .setDOMContent(container)
        .addTo(mapInstance);

      popup.on('close', unmount);
      keepPopupInView(mapInstance, popup);

      // The popup is part of the hover target: as long as the pointer is on it, it stays.
      const element = popup.getElement();
      element?.addEventListener('mouseenter', cancelClose);
      element?.addEventListener('mouseleave', scheduleClose);

      open = { popup, key };
    };

    const showPointer = () => {
      mapInstance.getCanvas().style.cursor = 'pointer';
    };
    const leaveStops = () => {
      mapInstance.getCanvas().style.cursor = '';
      scheduleClose();
    };

    mapInstance.on('click', TRANSIT_STOPS_LAYER_ID, openDepartures);
    // `mousemove` rather than `mouseenter`: moving from one stop straight onto the next one stays
    // inside the layer, so `mouseenter` would not fire again and the popup would show the wrong
    // stop. `openDepartures` returns early when it is already the right one.
    mapInstance.on('mousemove', TRANSIT_STOPS_LAYER_ID, openDepartures);
    mapInstance.on('mouseenter', TRANSIT_STOPS_LAYER_ID, showPointer);
    mapInstance.on('mouseleave', TRANSIT_STOPS_LAYER_ID, leaveStops);

    return () => {
      mapInstance.off('click', TRANSIT_STOPS_LAYER_ID, openDepartures);
      mapInstance.off('mousemove', TRANSIT_STOPS_LAYER_ID, openDepartures);
      mapInstance.off('mouseenter', TRANSIT_STOPS_LAYER_ID, showPointer);
      mapInstance.off('mouseleave', TRANSIT_STOPS_LAYER_ID, leaveStops);
      mapInstance.getCanvas().style.cursor = '';
      closeNow();
    };
  }, [mapReady, showTransit, language]);

  const handleMapStyle = (value) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'STANDARD') {
          next.delete('style');
        } else {
          next.set('style', value);
        }
        if (value === 'SATELLITE') {
          next.delete('buildings');
        }
        return next;
      },
      { replace: true },
    );
  };

  const handlePriceRange = (val) => {
    const maxPrice = getMaxPrice();
    if (maxPrice <= 0) return; // skip until listings are loaded
    setPriceRange(val);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (val[0] === 0) {
          next.delete('priceMin');
        } else {
          next.set('priceMin', String(val[0]));
        }
        if (val[1] === 0 || val[1] >= maxPrice) {
          next.delete('priceMax');
        } else {
          next.set('priceMax', String(val[1]));
        }
        return next;
      },
      { replace: true },
    );
  };

  const fetchListings = async () => {
    actions.listingsData.getListingsForMap({
      jobId,
    });
  };

  useEffect(() => {
    fetchListings();
  }, [jobId]);

  useEffect(() => {
    if (!map.current) return;

    // Use duration: 0 so the map jumps straight to the target view instead of
    // animating from the zoomed-out initial state. This effect re-runs whenever
    // listings/filters change, and the fly/zoom animation was distracting on
    // every refresh.
    if (homeAddresses.length > 0) {
      if (distanceFilter > 0) {
        const corners = homeAddresses.flatMap((home) =>
          getBoundsFromCenter([home.coords.lng, home.coords.lat], distanceFilter),
        );
        map.current.fitBounds(getBoundsFromCoords(corners), {
          padding: 20,
          maxZoom: 15,
          duration: 0,
        });
      } else if (homeAddresses.length === 1) {
        map.current.flyTo({
          center: [homeAddresses[0].coords.lng, homeAddresses[0].coords.lat],
          zoom: 12,
          duration: 0,
        });
      } else {
        const bounds = getBoundsFromCoords(homeAddresses.map((home) => [home.coords.lng, home.coords.lat]));
        map.current.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
          duration: 0,
        });
      }
    } else {
      const filtered = filterListings();
      const coords = filtered
        .filter((l) => l.latitude != null && l.longitude != null && l.latitude !== -1 && l.longitude !== -1)
        .map((l) => [l.longitude, l.latitude]);

      if (coords.length > 0) {
        const bounds = getBoundsFromCoords(coords);
        map.current.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
          duration: 0,
        });
      }
    }
  }, [homeAddresses, distanceFilter, listings]);

  useEffect(() => {
    if (!map.current) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    homeMarkers.current.forEach((marker) => marker.remove());
    homeMarkers.current = [];

    popupRoots.current.forEach((unmount) => unmount());
    popupRoots.current = [];

    homeAddresses.forEach((home) => {
      const marker = new maplibregl.Marker({ color: 'red' })
        .setLngLat([home.coords.lng, home.coords.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<div class="map-popup-content"><h4>${home.label || t('map.popupHomeAddress')}</h4><p>${home.address}</p></div>`,
          ),
        )
        .addTo(map.current);
      homeMarkers.current.push(marker);
    });

    const addCircleLayer = () => {
      if (!map.current || !map.current.isStyleLoaded()) return;
      if (map.current.getLayer('distance-circle')) map.current.removeLayer('distance-circle');
      if (map.current.getLayer('distance-circle-outline')) map.current.removeLayer('distance-circle-outline');
      if (map.current.getSource('distance-circle-source')) map.current.removeSource('distance-circle-source');

      if (distanceFilter > 0 && homeAddresses.length > 0) {
        map.current.addSource('distance-circle-source', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: homeAddresses.map((home) => ({
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [generateCircleCoords([home.coords.lng, home.coords.lat], distanceFilter)],
              },
            })),
          },
        });

        map.current.addLayer({
          id: 'distance-circle',
          type: 'fill',
          source: 'distance-circle-source',
          paint: {
            'fill-color': '#90EE90',
            'fill-opacity': 0.3,
          },
        });

        map.current.addLayer({
          id: 'distance-circle-outline',
          type: 'line',
          source: 'distance-circle-source',
          paint: {
            'line-color': '#006400',
            'line-width': 1,
          },
        });
      }
    };

    const updateLayers = () => {
      addCircleLayer();
    };

    if (map.current.isStyleLoaded()) {
      updateLayers();
    } else {
      map.current.on('load', updateLayers);
    }

    // One marker per position rather than per listing: listings that share an address (a whole
    // house, or a town that could only be geocoded to its centre) used to stack invisibly, with
    // only the topmost one reachable.
    groupListingsByPosition(filterListings()).forEach(({ lat, lng, listings: grouped }) => {
      let popup = null;
      let stopFit = null;

      // Paging changes the popup's height, so it has to be fitted into the map again.
      const refit = () => {
        if (!popup || !map.current) return;
        stopFit?.();
        stopFit = keepPopupInView(map.current, popup);
      };

      const { element, transitMount } = createListingPopupContent({ listings: grouped, t, onPageChange: refit });

      popup = new maplibregl.Popup({ offset: 25, maxWidth: LISTING_POPUP_MAX_WIDTH }).setDOMContent(element);

      // The stop list is only worth a request once the popup is actually opened, and it is the
      // same for the whole group, so it is mounted once and survives paging.
      popup.on('open', () => {
        refit();

        if (!transitMount || transitMount.dataset.mounted === 'true') return;
        transitMount.dataset.mounted = 'true';

        const unmount = mountPopupNode(
          transitMount,
          <NearbyStops lat={lat} lng={lng} limit={3} departureLimit={5} />,
          language,
        );
        popupRoots.current.push(unmount);
      });

      let color = '#3FB1CE';
      if (distanceFilter > 0 && homeAddresses.length > 0) {
        const inRange = homeAddresses.some(
          (home) => distanceMeters(home.coords.lat, home.coords.lng, lat, lng) <= distanceFilter * 1000,
        );
        if (inRange) {
          color = 'orange';
        }
      }

      const marker = new maplibregl.Marker({ color }).setLngLat([lng, lat]).setPopup(popup).addTo(map.current);

      if (grouped.length > 1) {
        // Says how many listings hide behind this pin, so a stack is recognisable before opening it.
        const badge = document.createElement('span');
        badge.className = 'map-marker-badge';
        badge.textContent = String(grouped.length);
        badge.title = t('map.popupSameAddress', { count: grouped.length });
        marker.getElement().appendChild(badge);
      }

      markers.current.push(marker);
    });
  }, [listings, priceRange, homeAddresses, distanceFilter]);

  return (
    <>
      <Headline text={t('map.title')} />
      <div className="map-view-container">
        {homeAddresses.length === 0 && (
          <Banner
            fullMode={true}
            type="warning"
            bordered
            closeIcon={null}
            style={{ marginBottom: '8px' }}
            description={
              <span>
                {t('map.noHomeAddressBefore')}
                <Link to="/userSettings">{t('map.noHomeAddressLink')}</Link>
                {t('map.noHomeAddressAfter')}
              </span>
            }
          />
        )}

        <Banner
          fullMode={true}
          type="info"
          bordered
          closeIcon={null}
          style={{ marginBottom: '8px' }}
          description={t('map.onlyValidAddresses')}
        />

        <div className="map-view-container__map-wrapper">
          <Map
            mapContainerRef={mapContainer}
            style={style}
            show3dBuildings={show3dBuildings}
            showTransit={showTransit}
            onMapReady={handleMapReady}
          />

          {/* Floating filter panel */}
          <div className="map-view-container__floating-panel">
            <div className="map-view-container__panel-row">
              <Text size="small" strong style={{ color: '#8892a4' }}>
                {t('map.filterJobLabel')}
              </Text>
              <Select
                placeholder={t('map.filterJobPlaceholder')}
                showClear
                size="small"
                onChange={(val) => setJobId(val)}
                value={jobId}
                style={{ width: 160 }}
              >
                {jobs?.map((j) => (
                  <Select.Option key={j.id} value={j.id}>
                    {j.name}
                  </Select.Option>
                ))}
              </Select>
            </div>

            <div className="map-view-container__panel-row">
              <Text size="small" strong style={{ color: '#8892a4' }}>
                {t('map.filterDistanceLabel')}
              </Text>
              <Select
                placeholder={t('map.filterDistanceNone')}
                size="small"
                onChange={(val) => setDistanceFilter(val)}
                value={distanceFilter}
                style={{ width: 100 }}
              >
                <Select.Option value={0}>{t('map.filterDistanceNone')}</Select.Option>
                <Select.Option value={5}>5 km</Select.Option>
                <Select.Option value={10}>10 km</Select.Option>
                <Select.Option value={15}>15 km</Select.Option>
                <Select.Option value={20}>20 km</Select.Option>
                <Select.Option value={25}>25 km</Select.Option>
              </Select>
            </div>

            <div className="map-view-container__panel-row">
              <Text size="small" strong style={{ color: '#8892a4' }}>
                {t('map.filterPriceLabel')}
              </Text>
              <div className="map-view-container__price-slider">
                <div className="map__rangesliderLabels">
                  <span>{priceRange[0]}</span>
                  <span>{priceRange[1]}</span>
                </div>
                <RangeSlider min={0} max={getMaxPrice()} step={100} value={priceRange} onInput={handlePriceRange} />
              </div>
            </div>

            <div className="map-view-container__panel-row">
              <Text size="small" strong style={{ color: '#8892a4' }}>
                {t('map.filterStyleLabel')}
              </Text>
              <Select size="small" value={style} onChange={(val) => handleMapStyle(val)} style={{ width: 110 }}>
                <Select.Option value="STANDARD">{t('map.filterStyleStandard')}</Select.Option>
                <Select.Option value="SATELLITE">{t('map.filterStyleSatellite')}</Select.Option>
              </Select>
            </div>

            <div className="map-view-container__panel-row">
              <Text size="small" strong style={{ color: '#8892a4' }}>
                {t('map.filter3dBuildings')}
              </Text>
              <Switch
                size="small"
                checked={show3dBuildings}
                onChange={(v) => setShow3dBuildings(v)}
                disabled={style === 'SATELLITE'}
              />
            </div>

            <div className="map-view-container__panel-row">
              <Text size="small" strong style={{ color: '#8892a4' }}>
                {t('map.filterTransit')}
              </Text>
              <Switch size="small" checked={showTransit} onChange={(v) => setShowTransit(v)} />
            </div>
          </div>
        </div>

        <ListingDeletionModal
          visible={deleteModalVisible}
          defaultDeleteType={defaultDeleteType}
          onConfirm={confirmListingDeletion}
          onCancel={() => {
            setDeleteModalVisible(false);
            setListingToDelete(null);
          }}
        />
      </div>
    </>
  );
}
