/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useRef } from 'react';
import { Button } from '@douyinfe/semi-ui-19';
import { IconFullScreenStroked, IconShrinkScreenStroked } from '@douyinfe/semi-icons';
import maplibregl from './maplibre.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { fixMapboxDrawCompatibility, addDrawingControl, setupAreaFilterEventListeners } from './MapDrawingExtension.js';
import { getBoundsFromCoords } from '../../views/listings/mapUtils.js';
import {
  applyBuildingsLayer,
  applyTransitLayers,
  OPENFREEMAP_GLYPHS_URL,
  TRANSIT_STOPS_LAYER_ID,
} from './overlayLayers.js';
import { ensureTransitIcons } from './transitIcons.js';
import { boundsForCountries, DEFAULT_COUNTRIES } from './countryBounds.js';
import { keepPopupInView, mountPopupNode } from './popupContent.jsx';
import DeparturesBoard from '../transit/DeparturesBoard.jsx';
import { useControllableState } from '../../hooks/useControllableState.js';
import { useSelector } from '../../services/state/store.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import MapControls from './MapControls.jsx';
import './Map.less';

/**
 * Marks the expanded map on `<body>`. The app's scroll container is `.app__content`, not the body,
 * so the lock has to be expressed as a descendant rule rather than `overflow: hidden` here.
 */
const EXPANDED_BODY_CLASS = 'fredy-map-expanded';

/** Colour of the pin the user drops in `pickMode`, distinct from listing blue and home red. */
const PICK_MARKER_COLOR = '#f5a623';

/**
 * Colour of the pins standing for the user's own addresses, on every map that draws them.
 *
 * Named rather than repeated at the two call sites, which is all this constant is for: listing pins
 * are the one blue, so red is unambiguous.
 *
 * @type {string}
 */
export const HOME_MARKER_COLOR = 'red';

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

/** Center of Germany, the fallback view when a consumer has nothing better to show. */
const GERMANY_CENTER = [10.4515, 51.1657];

/**
 * The one map in the app.
 *
 * The basemap and overlay switches live here rather than at the call sites, so every map gains them
 * by being a map. A small embedded map shows only an expand button; expanding flips the same
 * instance into a fullscreen overlay via CSS and reveals the controls. Nothing is remounted on the
 * way, which is what lets the camera, the drawn polygon and the loaded tiles survive the trip.
 *
 * The three overlay props are optionally controlled: leave them out to let the map keep the state,
 * pass them to own it (see `useControllableState`). `onControlsChange` fires once per user action
 * with a patch, never once per changed field, because a controlled parent may be writing them into
 * something that cannot take two updates in a tick, such as the URL.
 *
 * @param {Object} props
 * @param {[number, number]} [props.initialCenter] - Constructor only; later changes are ignored.
 * @param {number} [props.initialZoom] - Constructor only.
 * @param {string[]} [props.countries] - ISO 3166-1 alpha-2 codes the map should cover. `maxBounds`
 *   is the union of their boxes; unlike the two above this one is live, because the job form
 *   changes it as providers are ticked. Defaults to Germany.
 * @param {'STANDARD'|'SATELLITE'} [props.style] - Controlled basemap.
 * @param {boolean} [props.show3dBuildings] - Controlled 3D buildings overlay.
 * @param {boolean} [props.showTransit] - Controlled public transport overlay.
 * @param {'STANDARD'|'SATELLITE'} [props.defaultStyle]
 * @param {boolean} [props.defaultShow3dBuildings]
 * @param {boolean} [props.defaultShowTransit]
 * @param {(patch: Object) => void} [props.onControlsChange]
 * @param {'expanded'|'always'|'never'} [props.controlsMode] - When to show the controls panel.
 * @param {import('react').ReactNode} [props.transitExtra] - Extra row under the transit switch.
 * @param {boolean} [props.expanded] - Controlled expansion.
 * @param {boolean} [props.defaultExpanded]
 * @param {(expanded: boolean) => void} [props.onExpandedChange]
 * @param {boolean} [props.showExpandButton]
 * @param {boolean} [props.cooperativeGestures] - Require ctrl/two fingers while embedded. Lifted
 *   automatically while expanded, where the map is the only thing on screen to scroll.
 * @param {boolean} [props.pickMode] - Let the user drop a single draggable pin. Not combinable with
 *   `enableDrawing`; no call site needs both and the two would fight over the click.
 * @param {(coords: {lat: number, lng: number}) => void} [props.onPick]
 * @param {(map: Object) => void} [props.onMapReady]
 * @param {boolean} [props.enableDrawing]
 * @param {Object} [props.initialSpatialFilter]
 * @param {Function} [props.onDrawingChange]
 * @param {import('react').ReactNode} [props.panels] - Extra boxes for the top right column, below
 *   the map's own controls. For view-specific filters that belong with the map.
 * @param {import('react').ReactNode} [props.children] - Freely positioned overlay UI, rendered
 *   inside the shell so it travels into the fullscreen overlay without a portal.
 */
export default function Map({
  initialCenter = GERMANY_CENTER,
  initialZoom = 4,
  countries = DEFAULT_COUNTRIES,
  style,
  show3dBuildings,
  showTransit,
  defaultStyle = 'STANDARD',
  defaultShow3dBuildings = false,
  defaultShowTransit = false,
  onControlsChange = null,
  controlsMode = 'expanded',
  transitExtra = null,
  expanded,
  defaultExpanded = false,
  onExpandedChange = null,
  showExpandButton = true,
  cooperativeGestures = false,
  pickMode = false,
  onPick = null,
  onMapReady = null,
  enableDrawing = false,
  initialSpatialFilter = null,
  onDrawingChange = null,
  panels = null,
  children = null,
}) {
  const t = useTranslation();
  // Read here rather than passed in: departure boards are part of what the transit overlay *is*,
  // so every map that shows stops shows them, and the hover preference follows the user around.
  const userSettings = useSelector((state) => state.userSettings.settings);
  const language = userSettings?.language ?? 'en';
  const transitHoverPopups = userSettings?.transit_hover_popups === true;
  const shellRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const hasFittedToInitialAreaRef = useRef(false);
  const isInitialStyleRef = useRef(true);
  const focusBeforeExpandRef = useRef(null);

  const [styleValue, setStyleValue] = useControllableState(style, defaultStyle);
  const [buildingsValue, setBuildingsValue] = useControllableState(show3dBuildings, defaultShow3dBuildings);
  const [transitValue, setTransitValue] = useControllableState(showTransit, defaultShowTransit);
  const [isExpanded, setIsExpanded] = useControllableState(expanded, defaultExpanded);

  /**
   * The single entry point for control changes, so a controlled parent is told once per action.
   */
  const applyControls = (patch) => {
    // Satellite is raster imagery with no building footprints to extrude, so the two cannot both
    // be on. Coupling them here keeps every consumer from having to know that.
    const next = patch.style === 'SATELLITE' ? { ...patch, show3dBuildings: false } : patch;
    if ('style' in next) setStyleValue(next.style);
    if ('show3dBuildings' in next) setBuildingsValue(next.show3dBuildings);
    if ('showTransit' in next) setTransitValue(next.showTransit);
    onControlsChange?.(next);
  };

  const setExpanded = useCallback(
    (next) => {
      setIsExpanded(next);
      onExpandedChange?.(next);
    },
    [setIsExpanded, onExpandedChange],
  );

  // Initialize map - ONLY when container changes, never reinitialize
  useEffect(() => {
    if (mapRef.current) return; // Map already exists, don't reinitialize

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: STYLES[styleValue],
      center: initialCenter,
      zoom: initialZoom,
      maxBounds: boundsForCountries(countries),
      antialias: true,
      cooperativeGestures,
    });

    // Left, because the panels now live in the top right corner and a zoom button hiding behind
    // them helps nobody. Where drawing is enabled MapLibre simply stacks these below its tools.
    mapRef.current.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        visualizePitch: true,
        visualizeRoll: true,
      }),
      'top-left',
    );

    mapRef.current.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,
      }),
      'top-left',
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

  // The countries in scope can change while the map is up - the job form re-derives them as
  // providers are ticked - and the map is deliberately never remounted, so the new box has to be
  // pushed onto the live instance. Keeping the camera where it is: MapLibre clamps it into the new
  // bounds by itself if it now sits outside them.
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setMaxBounds(boundsForCountries(countries));
  }, [countries]);

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

    mapRef.current.setStyle(STYLES[styleValue]);
  }, [styleValue]);

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
      if (mapRef.current) applyBuildingsLayer(mapRef.current, buildingsValue);
    };

    if (mapRef.current.isStyleLoaded()) {
      onStyleData();
    }

    mapRef.current.on('styledata', onStyleData);

    return () => {
      mapRef.current?.off('styledata', onStyleData);
    };
  }, [buildingsValue, styleValue]);

  // Handle public transport layer
  useEffect(() => {
    if (!mapRef.current) return;

    const onStyleData = async () => {
      const mapInstance = mapRef.current;
      if (!mapInstance) return;

      // The stop icons are custom images and a style load drops them, so they have to be back
      // before the layer that references them is added - otherwise MapLibre draws nothing and
      // complains about a missing image.
      if (transitValue) {
        await ensureTransitIcons(mapInstance);
        // The map may have been torn down or restyled while the icons were being rasterised.
        if (mapRef.current !== mapInstance) return;
      }

      applyTransitLayers(mapInstance, transitValue);
    };

    if (mapRef.current.isStyleLoaded()) {
      onStyleData();
    }

    mapRef.current.on('styledata', onStyleData);

    return () => {
      mapRef.current?.off('styledata', onStyleData);
    };
  }, [transitValue, styleValue]);

  // Handle pitch for 3D
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setPitch(buildingsValue ? 45 : 0);
  }, [buildingsValue]);

  // Clicking a stop of the transit overlay opens its departure board. Hovering does the same, but
  // only for someone who asked for it: boards opening under the pointer while panning across a
  // city full of stops is the sort of help nobody asked for, so it is off unless switched on.
  //
  // The stop icons come from the vector tiles and carry OpenStreetMap ids, which mean nothing to a
  // timetable - the backend resolves the stop from the coordinates and the name instead.
  useEffect(() => {
    // Nothing while a pin is being placed: that click belongs to the position, not to a timetable.
    if (!mapRef.current || !transitValue || pickMode) return undefined;

    const mapInstance = mapRef.current;
    /** @type {{popup: import('maplibre-gl').Popup, key: string}|null} */
    let open = null;
    let closeTimer = null;
    /** Set while a click is opening a board, so the same click cannot also close it. */
    let justOpened = false;

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
        // On hover the popup follows the pointer and leaving the stop closes it, so a close button
        // would only be in the way. Opened by a click it stays put until something dismisses it,
        // and then the button is the obvious way out - alongside Escape and a click elsewhere.
        closeButton: !transitHoverPopups,
        // Handled below instead: MapLibre's own version closes on any map click, including the one
        // that just opened this popup.
        closeOnClick: false,
      })
        .setLngLat([lng, lat])
        .setDOMContent(container)
        .addTo(mapInstance);

      // Also reached by the popup's own close button, which closes it without going through
      // `closeNow` and would otherwise leave `open` pointing at a popup that is no longer there.
      popup.on('close', () => {
        unmount();
        if (open?.popup === popup) {
          open = null;
        }
      });
      keepPopupInView(mapInstance, popup);

      // The popup is part of the hover target: as long as the pointer is on it, it stays.
      const element = popup.getElement();
      element?.addEventListener('mouseenter', cancelClose);
      element?.addEventListener('mouseleave', scheduleClose);

      open = { popup, key };
      // Consumed by `closeOnMapClick`, which runs for this very same click.
      justOpened = event.type === 'click';
    };

    const showPointer = () => {
      mapInstance.getCanvas().style.cursor = 'pointer';
    };
    const clearPointer = () => {
      mapInstance.getCanvas().style.cursor = '';
    };
    const leaveStops = () => {
      clearPointer();
      scheduleClose();
    };

    // Anywhere on the map that is not another stop. The layer-specific handler above opens the
    // board and this one runs for the same click, so the stop it was just opened for has to be
    // excluded or the popup would close in the same breath as it appeared.
    //
    // Two guards rather than one, because getting this wrong makes the feature worse than it was:
    // the flag is set by the opener itself and cannot disagree with it, and the feature query
    // covers clicking straight from one stop to another.
    const closeOnMapClick = (event) => {
      if (justOpened) {
        justOpened = false;
        return;
      }
      if (open == null) return;
      const onAStop = mapInstance.queryRenderedFeatures(event.point, { layers: [TRANSIT_STOPS_LAYER_ID] });
      if (onAStop.length === 0) {
        closeNow();
      }
    };

    // Anywhere outside the map: the filter panel, the sidebar, the page around it. Canvas clicks
    // never reach this usefully - the target is always the canvas - which is what `closeOnMapClick`
    // is for.
    const closeOnOutsideClick = (event) => {
      if (open == null) return;
      const insidePopup = open.popup.getElement()?.contains(event.target);
      const insideMap = mapInstance.getContainer().contains(event.target);
      if (!insidePopup && !insideMap) {
        closeNow();
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && open != null) {
        closeNow();
      }
    };

    mapInstance.on('click', TRANSIT_STOPS_LAYER_ID, openDepartures);
    mapInstance.on('mouseenter', TRANSIT_STOPS_LAYER_ID, showPointer);
    mapInstance.on('click', closeOnMapClick);
    document.addEventListener('click', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);

    if (transitHoverPopups) {
      // `mousemove` rather than `mouseenter`: moving from one stop straight onto the next one
      // stays inside the layer, so `mouseenter` would not fire again and the popup would show the
      // wrong stop. `openDepartures` returns early when it is already the right one.
      mapInstance.on('mousemove', TRANSIT_STOPS_LAYER_ID, openDepartures);
      mapInstance.on('mouseleave', TRANSIT_STOPS_LAYER_ID, leaveStops);
    } else {
      mapInstance.on('mouseleave', TRANSIT_STOPS_LAYER_ID, clearPointer);
    }

    return () => {
      mapInstance.off('click', TRANSIT_STOPS_LAYER_ID, openDepartures);
      mapInstance.off('mousemove', TRANSIT_STOPS_LAYER_ID, openDepartures);
      mapInstance.off('mouseenter', TRANSIT_STOPS_LAYER_ID, showPointer);
      mapInstance.off('mouseleave', TRANSIT_STOPS_LAYER_ID, leaveStops);
      mapInstance.off('mouseleave', TRANSIT_STOPS_LAYER_ID, clearPointer);
      mapInstance.off('click', closeOnMapClick);
      document.removeEventListener('click', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      mapInstance.getCanvas().style.cursor = '';
      closeNow();
    };
    // `styleValue` because a style swap rebuilds the layer these handlers are bound to.
  }, [transitValue, transitHoverPopups, language, styleValue, pickMode]);

  // The canvas keeps the size it was measured at, so it has to be told the shell just changed size.
  // MapLibre watches the container itself (`trackResize`), but only every 50ms - long enough to see
  // the old canvas stretched across the new box. Two frames: one for the class to land, one for the
  // browser to lay the shell out again.
  useEffect(() => {
    if (!mapRef.current) return undefined;

    let inner = null;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => mapRef.current?.resize());
    });

    return () => {
      cancelAnimationFrame(outer);
      if (inner != null) cancelAnimationFrame(inner);
    };
  }, [isExpanded]);

  // Cooperative gestures exist to stop a small embedded map from swallowing the page scroll. Once
  // the map is the page, they are only in the way.
  useEffect(() => {
    if (!mapRef.current || !cooperativeGestures) return;
    if (isExpanded) mapRef.current.cooperativeGestures.disable();
    else mapRef.current.cooperativeGestures.enable();
  }, [isExpanded, cooperativeGestures]);

  // The scrollable element is the app shell, not the body, so the lock is a class the stylesheet
  // acts on. Cleanup runs on unmount too: navigating away while expanded must not leave the app
  // permanently unscrollable.
  useEffect(() => {
    if (!isExpanded) return undefined;

    document.body.classList.add(EXPANDED_BODY_CLASS);
    return () => document.body.classList.remove(EXPANDED_BODY_CLASS);
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded || pickMode) return undefined;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      // An open popup owns the first Escape. Its own handler is registered by a child effect and
      // therefore runs before this one, but it cannot stop this listener from also firing, so the
      // map would collapse out from under the popup it was closing.
      if (shellRef.current?.querySelector('.maplibregl-popup')) return;
      setExpanded(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isExpanded, pickMode, setExpanded]);

  // Move focus into the overlay and hand it back on the way out. This is not a focus trap: Tab can
  // still walk out into the page behind, which is a known limitation rather than an oversight.
  useEffect(() => {
    if (isExpanded) {
      focusBeforeExpandRef.current = document.activeElement;
      // Queried rather than held in a ref: Semi's Button does not promise to forward one to the
      // underlying element, and all this needs is something focusable inside the overlay.
      shellRef.current?.querySelector('.map-shell__expand')?.focus();
      return;
    }
    if (focusBeforeExpandRef.current instanceof HTMLElement) {
      focusBeforeExpandRef.current.focus();
      focusBeforeExpandRef.current = null;
    }
  }, [isExpanded]);

  // Pin dropping: one marker, moved rather than multiplied, draggable for the last few metres.
  useEffect(() => {
    if (!mapRef.current || !pickMode) return undefined;

    const mapInstance = mapRef.current;
    let marker = null;

    const place = ({ lng, lat }) => {
      if (marker == null) {
        marker = new maplibregl.Marker({ color: PICK_MARKER_COLOR, draggable: true })
          .setLngLat([lng, lat])
          .addTo(mapInstance);
        marker.on('dragend', () => {
          const position = marker.getLngLat();
          onPick?.({ lat: position.lat, lng: position.lng });
        });
      } else {
        marker.setLngLat([lng, lat]);
      }
      onPick?.({ lat, lng });
    };

    const onClick = (event) => place(event.lngLat);

    mapInstance.on('click', onClick);

    return () => {
      mapInstance.off('click', onClick);
      marker?.remove();
    };
  }, [pickMode, onPick]);

  const showControls = controlsMode === 'always' || (controlsMode === 'expanded' && isExpanded);
  const shellClassName = ['map-shell', isExpanded ? 'map-shell--expanded' : '', pickMode ? 'map-shell--picking' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={shellRef}
      className={shellClassName}
      role={isExpanded ? 'dialog' : undefined}
      aria-modal={isExpanded ? 'true' : undefined}
      aria-label={isExpanded ? t('map.expandedLabel') : undefined}
    >
      <div ref={mapContainerRef} className="map-container" />

      {/* One column in the top right corner: the expand button, the map's own controls, and
          whatever the consumer adds - stacked as separate boxes rather than piled on top of each
          other. MapLibre's own controls were moved to the left to keep this corner free. */}
      <div className="map-shell__ui">
        {showExpandButton && (
          <Button
            className="map-shell__expand"
            theme="solid"
            type="tertiary"
            icon={isExpanded ? <IconShrinkScreenStroked /> : <IconFullScreenStroked />}
            aria-label={isExpanded ? t('map.collapse') : t('map.expand')}
            title={isExpanded ? t('map.collapse') : t('map.expand')}
            onClick={() => setExpanded(!isExpanded)}
          />
        )}

        {showControls && (
          <MapControls
            style={styleValue}
            show3dBuildings={buildingsValue}
            showTransit={transitValue}
            onChange={applyControls}
            transitExtra={transitExtra}
          />
        )}

        {panels}
      </div>

      {children}
    </div>
  );
}
