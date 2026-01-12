/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useSelector, useActions } from '../../services/state/store.js';
import { Select, Slider, Space, Typography, Button, Popover, Divider, Switch, Banner } from '@douyinfe/semi-ui';
import { IconFilter } from '@douyinfe/semi-icons';
import no_image from '../../assets/no_image.jpg';
import './Map.less';

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
  const actions = useActions();
  const listings = useSelector((state) => state.listingsData.mapListings);
  const maxPriceFromStore = useSelector((state) => state.listingsData.maxPrice);
  const [style, setStyle] = useState('STANDARD');
  const [show3dBuildings, setShow3dBuildings] = useState(false);

  const jobs = useSelector((state) => state.jobsData.jobs);
  const [jobId, setJobId] = useState(null);
  const [priceRange, setPriceRange] = useState([0, 100000]);
  const [showFilterBar, setShowFilterBar] = useState(false);

  const lastJobIdRef = useRef('__INITIAL__');

  useEffect(() => {
    if (maxPriceFromStore > 0 && lastJobIdRef.current !== jobId) {
      setPriceRange([0, maxPriceFromStore]);
      lastJobIdRef.current = jobId;
    }
  }, [maxPriceFromStore, jobId]);

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
        showCompass: false,
        visualizePitch: true,
        visualizeRoll: true,
      }),
      'top-right',
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

    if (map.current.isStyleLoaded()) {
      add3dLayer();
    } else {
      map.current.once('styledata', add3dLayer);
    }
  }, [show3dBuildings, style]);

  const fetchListings = async () => {
    actions.listingsData.getListingsForMap({
      jobId,
      minPrice: priceRange[0] > 0 ? priceRange[0] : null,
      maxPrice: maxPriceFromStore > 0 && priceRange[1] < maxPriceFromStore ? priceRange[1] : null,
    });
  };

  useEffect(() => {
    fetchListings();
  }, [jobId, priceRange]);

  useEffect(() => {
    if (!map.current) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    listings.forEach((listing) => {
      if (
        listing.latitude != null &&
        listing.longitude != null &&
        listing.latitude !== -1 &&
        listing.longitude !== -1
      ) {
        const popup = new maplibregl.Popup({ offset: 25 }).setHTML(
          `<div class="map-popup-content">
            <img src="${listing.image_url || no_image}" alt="${listing.title}" />
            <h4>${listing.title}</h4>
            <div class="info">
              <span><strong>Price:</strong> ${listing.price ? listing.price + ' €' : 'N/A'}</span>
              <span><strong>Address:</strong> ${listing.address || 'N/A'}</span>
              <span><strong>Job:</strong> ${listing.job_name || 'N/A'}</span>
              <a href="${listing.link}" target="_blank" rel="noopener noreferrer">View Listing</a>
            </div>
          </div>`,
        );

        const marker = new maplibregl.Marker()
          .setLngLat([listing.longitude, listing.latitude])
          .setPopup(popup)
          .addTo(map.current);

        markers.current.push(marker);
      }
    });
  }, [listings]);

  return (
    <div className="map-view-container">
      <div className="listingsGrid__searchbar map-filter-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexGrow: 1 }}>
          <Text strong>Map View</Text>
          <Select placeholder="Style" style={{ width: 120 }} value={style} onChange={(val) => setStyle(val)}>
            <Select.Option value="STANDARD">Standard</Select.Option>
            <Select.Option value="SATELLITE">Satellite</Select.Option>
          </Select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem' }}>
            <Text strong>3D Buildings</Text>
            <Switch size="small" checked={show3dBuildings} onChange={(v) => setShow3dBuildings(v)} />
          </div>
        </div>
        <Popover content="Filter Results" style={{ color: 'white', padding: '.5rem' }}>
          <Button
            icon={<IconFilter />}
            onClick={() => {
              setShowFilterBar(!showFilterBar);
            }}
          />
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
                  onChange={(val) => setJobId(val)}
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
                <Text strong>Price Range (€):</Text>
              </div>
              <div style={{ width: 250, padding: '0 10px' }}>
                <Slider
                  range
                  min={0}
                  max={maxPriceFromStore || 100000}
                  step={100}
                  value={priceRange}
                  onChange={(val) => setPriceRange(val)}
                  tipFormatter={(val) => `${val} €`}
                />
              </div>
            </div>
          </Space>
        </div>
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
