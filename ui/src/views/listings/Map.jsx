/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useRef, useState } from 'react';
import { parseBoolean, parseNumber, parseString, useSearchParamState } from '../../hooks/useSearchParamState.js';
import { renderToString } from 'react-dom/server';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useActions, useSelector } from '../../services/state/store.js';
import { distanceMeters, generateCircleCoords, getBoundsFromCenter, getBoundsFromCoords } from './mapUtils.js';
import { Banner, Select, Switch, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconDelete, IconEyeOpened, IconLink } from '@douyinfe/semi-icons';

import no_image from '../../assets/no_image.png';
import _RangeSlider from 'react-range-slider-input';
import 'react-range-slider-input/dist/style.css';
import './Map.less';
import { xhrDelete } from '../../services/xhr.js';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ListingDeletionModal from '../../components/ListingDeletionModal.jsx';
import Map from '../../components/map/Map.jsx';
import Headline from '../../components/headline/Headline.jsx';
import { useTranslation } from '../../services/i18n/i18n.jsx';

const RangeSlider = _RangeSlider?.default ?? _RangeSlider;

const { Text } = Typography;

export default function MapView() {
  const t = useTranslation();
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const homeMarker = useRef(null);
  const actions = useActions();
  const navigate = useNavigate();
  const sp = useSearchParams();
  const [searchParams, setSearchParams] = sp;
  const listings = useSelector((state) => state.listingsData.mapListings);
  const userSettings = useSelector((state) => state.userSettings.settings);
  const homeAddress = userSettings?.home_address;
  const listingDeletionPref = userSettings?.listing_deletion_preference;
  const defaultDeleteType = listingDeletionPref?.hardDelete ? 'hard' : 'soft';

  const jobs = useSelector((state) => state.jobsData.jobs);
  const [jobId, setJobId] = useSearchParamState(sp, 'job', null, parseString);
  const [distanceFilter, setDistanceFilter] = useSearchParamState(sp, 'distance', 0, parseNumber);
  const [style] = useSearchParamState(sp, 'style', 'STANDARD', parseString);
  const [show3dBuildings, setShow3dBuildings] = useSearchParamState(sp, 'buildings', false, parseBoolean);

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
      Toast.error(error.message || t('map.toastDeleteError'));
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

  const [mapReady, setMapReady] = useState(false);

  const handleMapReady = (mapInstance) => {
    map.current = mapInstance;
    setMapReady(true);
  };

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
    if (homeAddress?.coords) {
      if (distanceFilter > 0) {
        const bounds = getBoundsFromCenter([homeAddress.coords.lng, homeAddress.coords.lat], distanceFilter);

        map.current.fitBounds(bounds, {
          padding: 20,
          maxZoom: 15,
          duration: 0,
        });
      } else {
        map.current.flyTo({
          center: [homeAddress.coords.lng, homeAddress.coords.lat],
          zoom: 12,
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
  }, [homeAddress?.address, distanceFilter, listings, mapReady]);

  useEffect(() => {
    if (!map.current) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    if (homeMarker.current) {
      homeMarker.current.remove();
      homeMarker.current = null;
    }

    if (homeAddress?.coords) {
      homeMarker.current = new maplibregl.Marker({ color: 'red' })
        .setLngLat([homeAddress.coords.lng, homeAddress.coords.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<div class="map-popup-content"><h4>${t('map.popupHomeAddress')}</h4><p>${homeAddress.address}</p></div>`,
          ),
        )
        .addTo(map.current);
    }

    const addCircleLayer = () => {
      if (!map.current || !map.current.isStyleLoaded()) return;
      if (map.current.getLayer('distance-circle')) map.current.removeLayer('distance-circle');
      if (map.current.getLayer('distance-circle-outline')) map.current.removeLayer('distance-circle-outline');
      if (map.current.getSource('distance-circle-source')) map.current.removeSource('distance-circle-source');

      if (distanceFilter > 0 && homeAddress?.coords) {
        const ret = generateCircleCoords([homeAddress.coords.lng, homeAddress.coords.lat], distanceFilter);

        map.current.addSource('distance-circle-source', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [ret],
            },
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

    filterListings().forEach((listing) => {
      if (
        listing.latitude != null &&
        listing.longitude != null &&
        listing.latitude !== -1 &&
        listing.longitude !== -1
      ) {
        const capitalizedProvider = listing.provider
          ? listing.provider.charAt(0).toUpperCase() + listing.provider.slice(1)
          : 'N/A';

        const popupContent = `
          <div class="map-popup-content">
            <img
              src="${listing.image_url}"
              onerror="this.onerror=null;this.src='${no_image}'"
            />
            <h4>${listing.title}</h4>
            <div class="info">
              <span><strong>${t('map.popupPrice')}</strong> ${listing.price ? listing.price + ' ' + (listing.currency ?? '€') : t('common.na')}</span>
              <span><strong>${t('map.popupAddress')}</strong> ${listing.address || t('common.na')}</span>
              <span><strong>${t('map.popupJob')}</strong> ${listing.job_name || t('common.na')}</span>
              <span><strong>${t('map.popupProvider')}</strong> ${capitalizedProvider}</span>
              <span><strong>${t('map.popupSize')}</strong> ${listing.size != null ? `${listing.size} m²` : t('common.na')}</span>
              <div style="display: flex; gap: 8px; margin-top: 8px; justify-content: space-between;">
                <div class="map-popup-content__linkButton">
                  <a href="${listing.link}" target="_blank" rel="noopener noreferrer">
                    ${renderToString(<IconLink />)}
                  </a>
                </div>
                <button
                  class="map-popup-content__detailsButton"
                  title="${t('map.popupViewDetails')}"
                  onclick="viewDetails('${listing.id}')"
                >
                  ${renderToString(<IconEyeOpened />)}
                </button>
                <button
                  class="map-popup-content__deleteButton"
                  title="${t('map.popupRemove')}"
                  onclick="deleteListing('${listing.id}')"
                >
                  ${renderToString(<IconDelete />)}
                </button>
              </div>
            </div>
          </div>`;

        const popup = new maplibregl.Popup({ offset: 25 }).setHTML(popupContent);

        let color = '#3FB1CE';
        if (distanceFilter > 0 && homeAddress?.coords) {
          const dist = distanceMeters(
            homeAddress.coords.lat,
            homeAddress.coords.lng,
            listing.latitude,
            listing.longitude,
          );
          if (dist <= distanceFilter * 1000) {
            color = 'orange';
          }
        }

        const marker = new maplibregl.Marker({ color })
          .setLngLat([listing.longitude, listing.latitude])
          .setPopup(popup)
          .addTo(map.current);

        markers.current.push(marker);
      }
    });
  }, [listings, priceRange, homeAddress, distanceFilter]);

  return (
    <>
      <Headline text={t('map.title')} />
      <div className="map-view-container">
        {!homeAddress && (
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
