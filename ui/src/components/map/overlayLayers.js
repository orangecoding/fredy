/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Optional map overlays (3D buildings, public transport) built on top of the shared OpenFreeMap
 * vector tiles.
 *
 * The helpers here are deliberately free of React and of anything browser specific: they only talk
 * to the MapLibre map instance that is handed in. That keeps them unit testable against a plain
 * stub map, which matters because every one of them runs on each `styledata` event.
 *
 * All `apply*` helpers are idempotent in both directions - adding checks for an existing layer
 * first, removing is a no-op when the layer is not there.
 */

import { TRANSIT_BUS_ICON, TRANSIT_RAIL_ICON } from './transitIcons.js';

/** Id of the shared OpenMapTiles vector source both overlays read from. */
export const OPENFREEMAP_SOURCE_ID = 'openfreemap';

/** TileJSON endpoint backing {@link OPENFREEMAP_SOURCE_ID}. */
export const OPENFREEMAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';

/** Glyph endpoint of the OpenFreeMap styles; needed by any style that renders our text labels. */
export const OPENFREEMAP_GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

/**
 * The overlay colours, once per basemap brightness.
 *
 * MapLibre paint cannot read a custom property, so these are the literals `AGENTS.md` allows for
 * map layers - collected here rather than scattered through two layer factories, and in two
 * complete sets rather than one set plus exceptions.
 *
 * Which set applies follows the *basemap*, not the theme. Aerial imagery is bright in both themes,
 * so the satellite basemap always takes `light`; only the dark vector basemap takes `dark`.
 *
 * `#e8e3de` on the dark basemap's own `rgb(12,12,12)` measures 15,3 to 1.
 *
 * @type {Readonly<Record<'light'|'dark', object>>}
 */
export const OVERLAY_PAINT = Object.freeze({
  light: {
    stopLabel: '#1f2937',
    stopHalo: '#ffffff',
    lineCasing: '#ffffff',
    lineCasingOpacity: 0.6,
    lineMetro: '#2563eb',
    lineTram: '#ef4444',
    lineOther: '#7c3aed',
    buildingLow: 'lightgray',
    buildingMid: 'royalblue',
    buildingHigh: 'lightblue',
    buildingOpacity: 0.6,
  },
  dark: {
    stopLabel: '#e8e3de',
    stopHalo: '#0c0c0c',
    lineCasing: '#000000',
    lineCasingOpacity: 0.55,
    lineMetro: '#60a5fa',
    lineTram: '#f87171',
    lineOther: '#a78bfa',
    buildingLow: '#2a2a2e',
    buildingMid: '#3b4a6b',
    buildingHigh: '#4a6fa5',
    buildingOpacity: 0.75,
  },
});

/**
 * Coerces anything to a paint variant.
 *
 * @param {unknown} variant
 * @returns {'light'|'dark'}
 */
function paintFor(variant) {
  return variant === 'dark' ? OVERLAY_PAINT.dark : OVERLAY_PAINT.light;
}

/** Id of the 3D buildings fill-extrusion layer. */
export const BUILDINGS_LAYER_ID = '3d-buildings';

/**
 * Ids of the public transport layers, in the order they are added. The label layer is only added
 * for styles that carry no labels of their own, see {@link applyTransitLayers}.
 * @type {string[]}
 */
export const TRANSIT_LAYER_IDS = ['transit-line-casing', 'transit-lines', 'transit-stops', 'transit-stop-labels'];

/** Layer whose stop features answer a click with a departure board. */
export const TRANSIT_STOPS_LAYER_ID = 'transit-stops';

/**
 * Rail (heavy rail) and transit (tram, subway, light rail) lines, minus yards and sidings which
 * carry a `service` tag and are noise at this scale.
 */
const TRANSIT_LINE_FILTER = [
  'all',
  ['match', ['get', 'class'], ['rail', 'transit'], true, false],
  ['!', ['has', 'service']],
];

/**
 * The POI classes that are places to catch something. `railway` covers stations, halts, subway and
 * tram stops; `bus` covers stops and bus stations. `rail` is what the OpenFreeMap basemap's own
 * transit layer filters on - these tiles never use it, but it costs nothing to keep.
 */
const TRANSIT_STOP_CLASSES = ['railway', 'rail', 'bus'];

/** Stations and stops, minus subway entrances - those are staircases, not places to catch a train. */
const TRANSIT_STOP_FILTER = [
  'all',
  ['match', ['get', 'class'], TRANSIT_STOP_CLASSES, true, false],
  ['!=', ['get', 'subclass'], 'subway_entrance'],
];

/**
 * A stop is several features in the data - one per pole, both directions, sometimes four around a
 * junction, all sharing a name. Every pole keeps its icon, because every pole is a place to catch
 * something, while the padding around each name lets MapLibre collide the closest copies away.
 *
 * Kept moderate on purpose: a wide padding does dedupe perfectly, but in a dense centre it also
 * collides the names against the basemap's shop labels until no stop is named at all. Filtering by
 * `rank` instead looked exact but OpenFreeMap's tiles do not hand out rank 1 for every group, which
 * silently left whole stations unnamed.
 */
const STOP_LABEL_PADDING = 10;

/**
 * Adds the shared OpenFreeMap vector source unless the style already carries it.
 *
 * @param {import('maplibre-gl').Map} map
 */
export function ensureOpenFreeMapSource(map) {
  if (!map.getSource(OPENFREEMAP_SOURCE_ID)) {
    map.addSource(OPENFREEMAP_SOURCE_ID, {
      type: 'vector',
      url: OPENFREEMAP_TILEJSON_URL,
    });
  }
}

/**
 * Where overlays are inserted, so they stay under the basemap's labels and over its geometry.
 *
 * Two conditions, and the second one is the whole reason this is not simply "the first label
 * layer". A style may label its water long before it draws its roads: in OpenFreeMap's `dark` the
 * first symbol layer carrying a `text-field` is `water_name` at position 9 of 47, and inserting
 * there puts the transit lines underneath every building, road and railway, which is to say
 * nowhere. `bright` puts it at position 95 of 119, above everything drawn, which is what the
 * overlays were built against.
 *
 * So: the first labelled symbol layer that comes *after* the last layer which is not a symbol.
 * On `bright` that is position 95 again, unchanged; on `dark` it is `place_other` at 38.
 *
 * @param {import('maplibre-gl').Map} map
 * @returns {string|undefined} the layer id, or `undefined` for styles without text labels (the
 * satellite style is raster only, in which case overlays are appended on top).
 */
export function findOverlayInsertionId(map) {
  const style = map.getStyle();
  const layers = style?.layers ?? [];
  const sources = style?.sources ?? {};

  // The basemap's own layers only. Ours - the transit and building overlays on the shared vector
  // source, the detail route and the distance ring on GeoJSON sources - sit on top of the geometry
  // already, and counting them moved the anchor above every label (the route line) or past the end
  // of the style (the ring), so an overlay switched on afterwards covered the street names.
  const isBasemap = (layer) =>
    layer.source == null || (layer.source !== OPENFREEMAP_SOURCE_ID && sources[layer.source]?.type !== 'geojson');

  let lastNonSymbol = -1;
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].type !== 'symbol' && isBasemap(layers[i])) {
      lastNonSymbol = i;
    }
  }

  for (let i = lastNonSymbol + 1; i < layers.length; i++) {
    if (layers[i].type === 'symbol' && isBasemap(layers[i]) && layers[i].layout?.['text-field']) {
      return layers[i].id;
    }
  }
  return undefined;
}

/**
 * Builds the 3D buildings layer spec.
 *
 * @param {object} paint One of {@link OVERLAY_PAINT}.
 * @returns {import('maplibre-gl').LayerSpecification}
 */
function buildingsLayer(paint) {
  return {
    id: BUILDINGS_LAYER_ID,
    source: OPENFREEMAP_SOURCE_ID,
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
        paint.buildingLow,
        200,
        paint.buildingMid,
        400,
        paint.buildingHigh,
      ],
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, ['get', 'render_height']],
      'fill-extrusion-base': ['case', ['>=', ['get', 'zoom'], 16], ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': paint.buildingOpacity,
    },
  };
}

/**
 * Builds the public transport layer specs, in draw order.
 *
 * The casing sits underneath the coloured line so the network stays readable over satellite
 * imagery, where there is no light basemap to contrast against.
 *
 * The lines carry no line number: OpenMapTiles' `transportation` layer exposes only
 * `class`/`subclass`/`brunnel`, and its `transportation_name` layer holds roads and footpaths but
 * no rail at all, so there is nothing to label them with. Which line serves a place is answered by
 * the departure board behind {@link TRANSIT_STOPS_LAYER_ID} instead.
 *
 * @param {object} paint One of {@link OVERLAY_PAINT}.
 * @returns {import('maplibre-gl').LayerSpecification[]}
 */
function transitLayers(paint) {
  return [
    {
      id: 'transit-line-casing',
      source: OPENFREEMAP_SOURCE_ID,
      'source-layer': 'transportation',
      type: 'line',
      minzoom: 8,
      filter: TRANSIT_LINE_FILTER,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': paint.lineCasing,
        'line-opacity': paint.lineCasingOpacity,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.8, 14, 4.5, 18, 7],
      },
    },
    {
      id: 'transit-lines',
      source: OPENFREEMAP_SOURCE_ID,
      'source-layer': 'transportation',
      type: 'line',
      minzoom: 8,
      filter: TRANSIT_LINE_FILTER,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': [
          'match',
          ['get', 'subclass'],
          ['subway', 'light_rail'],
          paint.lineMetro,
          ['tram'],
          paint.lineTram,
          paint.lineOther,
        ],
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 14, 2.5, 18, 5],
      },
    },
    {
      id: TRANSIT_STOPS_LAYER_ID,
      source: OPENFREEMAP_SOURCE_ID,
      'source-layer': 'poi',
      type: 'symbol',
      minzoom: 12,
      filter: TRANSIT_STOP_FILTER,
      layout: {
        'icon-image': ['match', ['get', 'class'], ['bus'], TRANSIT_BUS_ICON, TRANSIT_RAIL_ICON],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.45, 15, 0.75, 18, 1],
        // Stops sit close together in a city centre, and a dropped icon is a stop the user cannot
        // ask about. Showing all of them beats a tidy but incomplete map.
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
    {
      id: 'transit-stop-labels',
      source: OPENFREEMAP_SOURCE_ID,
      'source-layer': 'poi',
      type: 'symbol',
      minzoom: 14,
      filter: TRANSIT_STOP_FILTER,
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        // Collides the other poles of the same stop away, see STOP_LABEL_PADDING.
        'text-padding': STOP_LABEL_PADDING,
        // The pole the data considers primary is placed first and therefore wins that collision.
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-anchor': 'top',
        // Clears the icon above it, which grows with the zoom level.
        'text-offset': [0, 1.5],
        'text-max-width': 9,
      },
      paint: {
        'text-color': paint.stopLabel,
        'text-halo-color': paint.stopHalo,
        'text-halo-width': 1.2,
      },
    },
  ];
}

/**
 * Removes overlay layers, ignoring the ones that are not on the map.
 *
 * The shared source deliberately stays behind: the other overlay may still be using it, and
 * re-adding it on the next toggle would only refetch the same TileJSON.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {string[]} layerIds
 */
function removeLayers(map, layerIds) {
  for (const id of layerIds) {
    if (map.getLayer(id)) {
      map.removeLayer(id);
    }
  }
}

/**
 * Adds overlay layers underneath `beforeId`, skipping the ones that are already on the map.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {import('maplibre-gl').LayerSpecification[]} layers
 * @param {string|undefined} beforeId
 */
function addLayers(map, layers, beforeId) {
  for (const layer of layers) {
    if (!map.getLayer(layer.id)) {
      map.addLayer(layer, beforeId);
    }
  }
}

/**
 * The vector basemap's layer dedicated to transit POIs - it draws the very same stops the overlay
 * draws, so it is switched off wholesale while the overlay is on.
 */
const BASEMAP_TRANSIT_POI_LAYER = 'poi_transit';

/**
 * The basemap's generic POI layers. They select purely by `rank`, so they render bus stops and
 * stations alongside bakeries and cinemas; only the transit classes may be filtered out of them.
 */
const BASEMAP_POI_LAYERS = ['poi_r1', 'poi_r7', 'poi_r20'];

/** Matches everything except the stops the overlay draws itself. */
const NOT_A_TRANSIT_STOP = ['!', ['match', ['get', 'class'], TRANSIT_STOP_CLASSES, true, false]];

/**
 * The untouched filters of {@link BASEMAP_POI_LAYERS}, per map, so they can be put back.
 * @type {WeakMap<object, Map<string, unknown>>}
 */
const originalPoiFilters = new WeakMap();

/**
 * Hides or restores the stops the basemap draws on its own.
 *
 * Without this every stop carries two icons: the basemap's and the overlay's. A no-op on styles
 * that have no such layers, e.g. the raster satellite style.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {boolean} visible
 */
function setBasemapTransitPoisVisible(map, visible) {
  if (map.getLayer(BASEMAP_TRANSIT_POI_LAYER)) {
    map.setLayoutProperty(BASEMAP_TRANSIT_POI_LAYER, 'visibility', visible ? 'visible' : 'none');
  }

  let saved = originalPoiFilters.get(map);
  if (!saved) {
    saved = new Map();
    originalPoiFilters.set(map, saved);
  }

  for (const id of BASEMAP_POI_LAYERS) {
    if (!map.getLayer(id)) continue;

    // Captured before the first modification; a style reload resets the layer to this same filter,
    // so it stays the right thing to restore and to build the narrowed filter from.
    if (!saved.has(id)) {
      saved.set(id, map.getFilter(id) ?? null);
    }
    const original = saved.get(id);

    if (visible) {
      map.setFilter(id, original);
    } else {
      map.setFilter(id, original ? ['all', original, NOT_A_TRANSIT_STOP] : NOT_A_TRANSIT_STOP);
    }
  }
}

/**
 * Applies the 3D buildings overlay.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {boolean} enabled
 * @param {'light'|'dark'} [variant='light'] Follows the basemap's brightness, not the theme.
 */
export function applyBuildingsLayer(map, enabled, variant = 'light') {
  if (!enabled) {
    removeLayers(map, [BUILDINGS_LAYER_ID]);
    return;
  }
  ensureOpenFreeMapSource(map);
  addLayers(map, [buildingsLayer(paintFor(variant))], findOverlayInsertionId(map));
}

/**
 * Applies the public transport overlay (rail/tram/subway lines plus stops and their names).
 *
 * @param {import('maplibre-gl').Map} map
 * @param {boolean} enabled
 * @param {'light'|'dark'} [variant='light'] Follows the basemap's brightness, not the theme.
 */
export function applyTransitLayers(map, enabled, variant = 'light') {
  setBasemapTransitPoisVisible(map, !enabled);

  if (!enabled) {
    removeLayers(map, TRANSIT_LAYER_IDS);
    return;
  }

  ensureOpenFreeMapSource(map);
  // The basemap's own stop icons and names are suppressed above, so the overlay names its stops
  // itself on every style - one icon, one name, and the same look on the satellite basemap.
  //
  // On the dark basemap there is nothing to suppress: it ships no POI layers at all, which is also
  // why the overlay is the only thing naming a stop there.
  addLayers(map, transitLayers(paintFor(variant)), findOverlayInsertionId(map));
}
