/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { fixMapboxDrawCompatibility, addDrawingControl, setupAreaFilterEventListeners } from './MapDrawingExtension.js';
import './Map.less';

export const GERMANY_BOUNDS = [
  [5.866, 47.27], // Southwest coordinates
  [15.042, 55.059], // Northeast coordinates
];

export const STYLES = {
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

export default forwardRef(function Map(
  {
    style = 'STANDARD',
    show3dBuildings = false,
    onMapReady = null,
    enableDrawing = false,
    initialSpatialFilter = null,
    onDrawingChange = null,
  },
  ref,
) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getDrawingData: () => {
      if (drawRef.current) {
        return drawRef.current.getAll();
      }
      return null;
    },
    setDrawingData: (data) => {
      if (drawRef.current && data) {
        drawRef.current.set(data);
      }
    },
  }));

  // Initialize map - ONLY when container changes, never reinitialize
  useEffect(() => {
    if (mapRef.current) return; // Map already exists, don't reinitialize

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: STYLES[style],
      center: [10.4515, 51.1657], // Center of Germany
      zoom: 4,
      maxBounds: GERMANY_BOUNDS,
      antialias: true,
    });

    mapRef.current.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        visualizePitch: true,
        visualizeRoll: true,
      }),
      'top-right',
    );

    mapRef.current.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,
      }),
    );

    // Initialize drawing extension only if enabled
    if (enableDrawing) {
      fixMapboxDrawCompatibility();
      drawRef.current = addDrawingControl(mapRef.current);
    }

    // Call onMapReady callback if provided
    if (onMapReady) {
      onMapReady(mapRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapContainerRef]); // ONLY depend on mapContainerRef - nothing else!

  // Load spatial filter and setup area filter event listeners
  useEffect(() => {
    if (!mapRef.current || !drawRef.current || !enableDrawing) return;

    // Load initial spatial filter if provided
    if (initialSpatialFilter) {
      try {
        drawRef.current.set(initialSpatialFilter);
      } catch (error) {
        console.error('Error loading spatial filter:', error);
      }
    }

    // Setup drawing event listeners
    const cleanup = setupAreaFilterEventListeners(mapRef.current, drawRef.current, onDrawingChange);

    return cleanup;
  }, [initialSpatialFilter, onDrawingChange, enableDrawing]);

  // Handle style changes
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setStyle(STYLES[style]);
    }
  }, [style]);

  // Handle 3D buildings layer
  useEffect(() => {
    if (!mapRef.current) return;

    const add3dLayer = () => {
      if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;
      if (show3dBuildings) {
        if (!mapRef.current.getSource('openfreemap')) {
          mapRef.current.addSource('openfreemap', {
            type: 'vector',
            url: 'https://tiles.openfreemap.org/planet',
          });
        }
        if (!mapRef.current.getLayer('3d-buildings')) {
          const layers = mapRef.current.getStyle().layers;
          let labelLayerId;
          for (let i = 0; i < layers.length; i++) {
            if (layers[i].type === 'symbol' && layers[i].layout?.['text-field']) {
              labelLayerId = layers[i].id;
              break;
            }
          }
          mapRef.current.addLayer(
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
        if (mapRef.current.getLayer('3d-buildings')) {
          mapRef.current.removeLayer('3d-buildings');
        }
      }
    };

    add3dLayer();
  }, [show3dBuildings, style]);

  // Handle pitch for 3D
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setPitch(show3dBuildings ? 45 : 0);
  }, [show3dBuildings]);

  return <div ref={mapContainerRef} className="map-container" />;
});
