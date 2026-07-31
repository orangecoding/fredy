/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useRef } from 'react';
import maplibregl from './maplibre.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { fixMapboxDrawCompatibility, addDrawingControl, setupAreaFilterEventListeners } from './MapDrawingExtension.js';
import { getBoundsFromCoords } from '../../views/listings/mapUtils.js';
import { applyBuildingsLayer, applyTransitLayers, OPENFREEMAP_GLYPHS_URL } from './overlayLayers.js';
import { ensureTransitIcons } from './transitIcons.js';
import './Map.less';

export const GERMANY_BOUNDS = [
  [5.866, 47.27], // Southwest coordinates
  [15.042, 55.059], // Northeast coordinates
];

export const STYLES = {
  STANDARD: 'https://tiles.openfreemap.org/styles/bright',
  SATELLITE: {
    version: 8,
    // Raster tiles need no glyphs, but the transit overlay labels its stops with them - the
    // satellite imagery carries no names of its own.
    glyphs: OPENFREEMAP_GLYPHS_URL,
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

export default function Map({
  style = 'STANDARD',
  show3dBuildings = false,
  showTransit = false,
  onMapReady = null,
  enableDrawing = false,
  initialSpatialFilter = null,
  onDrawingChange = null,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const hasFittedToInitialAreaRef = useRef(false);
  const isInitialStyleRef = useRef(true);

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

      if (!hasFittedToInitialAreaRef.current) {
        const coords = initialSpatialFilter.features.flatMap((feature) =>
          feature.geometry?.type === 'Polygon' ? feature.geometry.coordinates.flat() : [],
        );
        const bounds = getBoundsFromCoords(coords);
        if (bounds) {
          mapRef.current.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 0 });
          hasFittedToInitialAreaRef.current = true;
        }
      }
    }

    // Setup drawing event listeners
    const cleanup = setupAreaFilterEventListeners(mapRef.current, drawRef.current, onDrawingChange);

    return cleanup;
  }, [initialSpatialFilter, onDrawingChange, enableDrawing]);

  // Handle style changes
  useEffect(() => {
    if (!mapRef.current) return;

    // The map constructor already applied the initial style. Calling setStyle() again on mount
    // starts a second, racing style load that finishes later and wipes every custom source/layer
    // added in the meantime (3D buildings, distance circles), so skip the very first run.
    if (isInitialStyleRef.current) {
      isInitialStyleRef.current = false;
      return;
    }

    mapRef.current.setStyle(STYLES[style]);
  }, [style]);

  // Handle 3D buildings layer
  //
  // The style is not ready on mount, and `setStyle()` (see the effect above) drops every custom
  // source/layer and reloads asynchronously, so the layers have to be (re)applied whenever a style
  // finishes loading. `styledata` is the right signal for that: `isStyleLoaded()` is a stricter
  // condition than what `addSource`/`addLayer` actually need (it also waits for every source to
  // load its tiles) and right after a `setStyle()` call it still reports the outgoing style.
  // The listener stays attached for the lifetime of the effect, and the `apply*` helpers are
  // idempotent. The same pattern applies to the transit overlay below.
  useEffect(() => {
    if (!mapRef.current) return;

    const onStyleData = () => {
      if (mapRef.current) applyBuildingsLayer(mapRef.current, show3dBuildings);
    };

    if (mapRef.current.isStyleLoaded()) {
      onStyleData();
    }

    mapRef.current.on('styledata', onStyleData);

    return () => {
      mapRef.current?.off('styledata', onStyleData);
    };
  }, [show3dBuildings, style]);

  // Handle public transport layer
  useEffect(() => {
    if (!mapRef.current) return;

    const onStyleData = async () => {
      const mapInstance = mapRef.current;
      if (!mapInstance) return;

      // The stop icons are custom images and a style load drops them, so they have to be back
      // before the layer that references them is added - otherwise MapLibre draws nothing and
      // complains about a missing image.
      if (showTransit) {
        await ensureTransitIcons(mapInstance);
        // The map may have been torn down or restyled while the icons were being rasterised.
        if (mapRef.current !== mapInstance) return;
      }

      applyTransitLayers(mapInstance, showTransit);
    };

    if (mapRef.current.isStyleLoaded()) {
      onStyleData();
    }

    mapRef.current.on('styledata', onStyleData);

    return () => {
      mapRef.current?.off('styledata', onStyleData);
    };
  }, [showTransit, style]);

  // Handle pitch for 3D
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setPitch(show3dBuildings ? 45 : 0);
  }, [show3dBuildings]);

  return <div ref={mapContainerRef} className="map-container" />;
}
