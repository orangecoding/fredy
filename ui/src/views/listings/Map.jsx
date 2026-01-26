/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useEffect, useRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useSelector, useActions } from '../../services/state/store.js';
import { distanceMeters, generateCircleCoords, getBoundsFromCenter } from './mapUtils.js';
import { Select, Space, Typography, Button, Popover, Divider, Switch, Banner, Toast } from '@douyinfe/semi-ui-19';
import { IconFilter, IconLink } from '@douyinfe/semi-icons';
import { IconDelete } from '@douyinfe/semi-icons';

import no_image from '../../assets/no_image.jpg';
import RangeSlider from 'react-range-slider-input';
import 'react-range-slider-input/dist/style.css';
import './Map.less';
import { xhrDelete } from '../../services/xhr.js';
import { Link } from 'react-router';

const { Text } = Typography;

const GERMANY_BOUNDS = [
  [5.866, 47.27], // Southwest coordinates
  [15.042, 55.059], // Northeast coordinates
];

const STYLES = {
  STANDARD: 'https://tiles.openfreemap.org/styles/bright',
  SATELLITE: {
    version: 8,
    sources: {
      'satellite-tiles': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      },
      'satellite-labels': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: '© Esri',
      },
    },
    layers: [
      {
        id: 'satellite-tiles',
        type: 'raster',
        source: 'satellite-tiles',
        minzoom: 0,
        maxzoom: 19,
      },
      {
        id: 'satellite-labels',
        type: 'raster',
        source: 'satellite-labels',
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  },
};

export default function MapView() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const homeMarker = useRef(null);
  const actions = useActions();
  const listings = useSelector((state) => state.listingsData.mapListings);
  const homeAddress = useSelector((state) => state.userSettings.settings.home_address);
  const [style, setStyle] = useState('STANDARD');
  const [show3dBuildings, setShow3dBuildings] = useState(false);

  const jobs = useSelector((state) => state.jobsData.jobs);
  const [jobId, setJobId] = useState(null);
  const [priceRange, setPriceRange] = useState([0, 0]);
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [distanceFilter, setDistanceFilter] = useState(0);

  useEffect(() => {
    setPriceRange([0, getMaxPrice()]);
  }, [listings]);

  const getMaxPrice = () => {
    return listings.reduce((max, item) => {
      const price = Number(item.price);
      return Number.isFinite(price) && price > max ? price : max;
    }, -Infinity);
  };

  const filterListings = () => {
    const min = priceRange[0];
    const max = priceRange[1] && priceRange[1] > 0 ? priceRange[1] : getMaxPrice();

    return listings.filter((listing) => listing.price && listing.price >= min && listing.price <= max);
  };

  useEffect(() => {
    window.deleteListing = async (id) => {
      try {
        await xhrDelete('/api/listings/', { ids: [id] });
        Toast.success('Listing successfully removed');
        fetchListings();
      } catch (error) {
        Toast.error(error.message || 'Error deleting listing');
      }
    };

    return () => {
      delete window.deleteListing;
    };
  }, []);

  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: STYLES[style],
      center: [10.4515, 51.1657], // Center of Germany
      zoom: 4,
      maxBounds: GERMANY_BOUNDS,
      antialias: true,
    });

    map.current.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        visualizePitch: true,
        visualizeRoll: true,
      }),
      'top-right',
    );

    map.current.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,
      }),
    );

    return () => {
      map.current.remove();
    };
  }, []);

  useEffect(() => {
    if (map.current) {
      map.current.setStyle(STYLES[style]);
    }
  }, [style]);

  useEffect(() => {
    if (show3dBuildings && style !== 'STANDARD') {
      setStyle('STANDARD');
    }
  }, [show3dBuildings, style]);

  useEffect(() => {
    if (!map.current) return;

    map.current.setPitch(show3dBuildings ? 45 : 0);
  }, [show3dBuildings]);

  useEffect(() => {
    if (!map.current) return;

    const add3dLayer = () => {
      if (!map.current || !map.current.isStyleLoaded()) return;
      if (show3dBuildings) {
        if (!map.current.getSource('openfreemap')) {
          map.current.addSource('openfreemap', {
            type: 'vector',
            url: 'https://tiles.openfreemap.org/planet',
          });
        }
        if (!map.current.getLayer('3d-buildings')) {
          const layers = map.current.getStyle().layers;
          let labelLayerId;
          for (let i = 0; i < layers.length; i++) {
            if (layers[i].type === 'symbol' && layers[i].layout?.['text-field']) {
              labelLayerId = layers[i].id;
              break;
            }
          }
          map.current.addLayer(
            {
              id: '3d-buildings',
              source: 'openfreemap',
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 15,
              filter: ['!=', ['get', 'hide_3d'], true],
              paint: {
                'fill-extrusion-color': [
                  'interpolate',
                  ['linear'],
                  ['get', 'render_height'],
                  0,
                  'lightgray',
                  200,
                  'royalblue',
                  400,
                  'lightblue',
                ],
                'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, ['get', 'render_height']],
                'fill-extrusion-base': ['case', ['>=', ['get', 'zoom'], 16], ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.6,
              },
            },
            labelLayerId,
          );
        }
      } else {
        if (map.current.getLayer('3d-buildings')) {
          map.current.removeLayer('3d-buildings');
        }
      }
    };

    add3dLayer();
  }, [show3dBuildings, style]);

  const setMapStyle = (value) => {
    setStyle(value);
    if (value === 'SATELLITE') {
      setShow3dBuildings(false);
    }
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
    if (!map.current || !homeAddress?.coords) return;

    // We only want to zoom/fly when distanceFilter OR homeAddress actually change,
    // not on every render. useEffect dependency array handles this.
    if (distanceFilter > 0) {
      const bounds = getBoundsFromCenter([homeAddress.coords.lng, homeAddress.coords.lat], distanceFilter);

      map.current.fitBounds(bounds, {
        padding: 20,
        maxZoom: 15,
        duration: 1000,
      });
    } else {
      map.current.flyTo({
        center: [homeAddress.coords.lng, homeAddress.coords.lat],
        zoom: 12,
        duration: 1000,
      });
    }
  }, [homeAddress?.address, distanceFilter]);

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
            `<div class="map-popup-content"><h4>Home Address</h4><p>${homeAddress.address}</p></div>`,
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

    addCircleLayer();

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
            <img src="${listing.image_url || no_image}" alt="${listing.title}" />
            <h4>${listing.title}</h4>
            <div class="info">
              <span><strong>Price:</strong> ${listing.price ? listing.price + ' €' : 'N/A'}</span>
              <span><strong>Address:</strong> ${listing.address || 'N/A'}</span>
              <span><strong>Job:</strong> ${listing.job_name || 'N/A'}</span>
              <span><strong>Provider:</strong> ${capitalizedProvider}</span>
              <span><strong>Size:</strong> ${listing.size != null ? `${listing.size} m²` : 'N/A'}</span>
              <div style="display: flex; gap: 8px; margin-top: 8px; justify-content: space-between;">
                <div class="map-popup-content__linkButton">
                  <a href="${listing.link}" target="_blank" rel="noopener noreferrer">
                    ${renderToString(<IconLink />)}
                  </a>
                </div>
                <button
                  class="map-popup-content__deleteButton"
                  title="Remove"
                  onclick="deleteListing('${listing.id}')"
                >
                  ${renderToString(<IconDelete />)}
                </button>
              </div>
            </div>
          </div>`;

        const popup = new maplibregl.Popup({ offset: 25 }).setHTML(popupContent);

        let color = '#3FB1CE'; // Default blue-ish
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
    <div className="map-view-container">
      <div className="listingsGrid__searchbar map-filter-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexGrow: 1 }}>
          <Text strong>Map View</Text>
          <Select placeholder="Style" style={{ width: 120 }} value={style} onChange={(val) => setMapStyle(val)}>
            <Select.Option value="STANDARD">Standard</Select.Option>
            <Select.Option value="SATELLITE">Satellite</Select.Option>
          </Select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem' }}>
            <Text strong>3D Buildings</Text>
            <Switch size="small" checked={show3dBuildings} onChange={(v) => setShow3dBuildings(v)} />
          </div>
        </div>
        <Popover content="Filter Results" style={{ color: 'white', padding: '.5rem' }}>
          <div>
            <Button
              icon={<IconFilter />}
              onClick={() => {
                setShowFilterBar(!showFilterBar);
              }}
            />
          </div>
        </Popover>
      </div>

      {showFilterBar && (
        <div className="listingsGrid__toolbar">
          <Space wrap style={{ marginBottom: '1rem' }}>
            <div className="listingsGrid__toolbar__card">
              <div>
                <Text strong>Filter by:</Text>
              </div>
              <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                <Select
                  placeholder="Job"
                  showClear
                  style={{ width: 150 }}
                  onChange={(val) => {
                    setJobId(val);
                  }}
                  value={jobId}
                >
                  {jobs?.map((j) => (
                    <Select.Option key={j.id} value={j.id}>
                      {j.name}
                    </Select.Option>
                  ))}
                </Select>
              </div>
            </div>
            <Divider layout="vertical" />
            <div className="listingsGrid__toolbar__card">
              <div>
                <Text strong>Distance:</Text>
              </div>
              <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                <Select
                  placeholder="Distance"
                  style={{ width: 100 }}
                  onChange={(val) => {
                    setDistanceFilter(val);
                  }}
                  value={distanceFilter}
                >
                  <Select.Option value={0}>---</Select.Option>
                  <Select.Option value={5}>5 km</Select.Option>
                  <Select.Option value={10}>10 km</Select.Option>
                  <Select.Option value={15}>15 km</Select.Option>
                  <Select.Option value={20}>20 km</Select.Option>
                  <Select.Option value={25}>25 km</Select.Option>
                </Select>
              </div>
            </div>
            <Divider layout="vertical" />
            <div className="listingsGrid__toolbar__card">
              <div>
                <Text strong>Price Range (€):</Text>
              </div>
              <div style={{ width: 250, padding: '0 10px' }}>
                <div className="map__rangesliderLabels">
                  <span>{priceRange[0]} €</span>
                  <span>{priceRange[1]} €</span>
                </div>
                <RangeSlider
                  min={0}
                  max={getMaxPrice()}
                  step={100}
                  value={priceRange}
                  onInput={(val) => {
                    setPriceRange(val);
                  }}
                  tipFormatter={(val) => `${val} €`}
                />
              </div>
            </div>
          </Space>
        </div>
      )}

      {!homeAddress && (
        <Banner
          fullMode={true}
          type="warning"
          bordered
          closeIcon={null}
          description={
            <span>
              You have not set your home address yet. Please do so in the <Link to="/userSettings">user settings</Link>{' '}
              to use the distance filter.
            </span>
          }
        />
      )}

      <Banner
        fullMode={true}
        type="info"
        bordered
        closeIcon={null}
        description="Keep in mind, only listings with proper adresses are being shown on this map."
      />

      <div ref={mapContainer} className="map-container" />
    </div>
  );
}
