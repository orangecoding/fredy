/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  applyBuildingsLayer,
  applyTransitLayers,
  BUILDINGS_LAYER_ID,
  ensureOpenFreeMapSource,
  findFirstSymbolLayerId,
  OPENFREEMAP_SOURCE_ID,
  OPENFREEMAP_TILEJSON_URL,
  TRANSIT_LAYER_IDS,
  TRANSIT_STOPS_LAYER_ID,
} from '../../ui/src/components/map/overlayLayers.js';

/**
 * A stand-in for the MapLibre map, reduced to the handful of style methods the overlay helpers
 * touch. It records what was added so the assertions can look at the resulting style rather than at
 * call counts. No DOM involved - the vitest environment is `node`.
 *
 * @param {Array<{id: string, type: string, layout?: object}>} [styleLayers] - layers the basemap
 * style ships with. The vector basemap has a text symbol layer, the raster satellite style has none.
 */
function makeMap(styleLayers = []) {
  const sources = {};
  const layers = [...styleLayers];
  const added = [];

  return {
    layers,
    sources,
    /** Layer specs handed to `addLayer`, paired with their `beforeId`. */
    added,
    getSource: (id) => sources[id],
    addSource: (id, spec) => {
      sources[id] = spec;
    },
    getLayer: (id) => layers.find((layer) => layer.id === id),
    getFilter: (id) => layers.find((layer) => layer.id === id)?.filter,
    setFilter: (id, filter) => {
      const layer = layers.find((existing) => existing.id === id);
      if (!layer) throw new Error(`setFilter called for missing layer ${id}`);
      layer.filter = filter;
    },
    addLayer: (layer, beforeId) => {
      added.push({ layer, beforeId });
      const index = beforeId ? layers.findIndex((existing) => existing.id === beforeId) : -1;
      if (index === -1) {
        layers.push(layer);
      } else {
        layers.splice(index, 0, layer);
      }
    },
    removeLayer: (id) => {
      const index = layers.findIndex((layer) => layer.id === id);
      if (index === -1) throw new Error(`removeLayer called for missing layer ${id}`);
      layers.splice(index, 1);
    },
    setLayoutProperty: (id, property, value) => {
      const layer = layers.find((existing) => existing.id === id);
      if (!layer) throw new Error(`setLayoutProperty called for missing layer ${id}`);
      layer.layout = { ...layer.layout, [property]: value };
    },
    getStyle: () => ({ layers }),
  };
}

/**
 * The shape of the vector basemap: a label layer overlays are supposed to stay underneath, plus the
 * basemap's own transit POIs, which would otherwise double every stop icon.
 */
const LABELLED_STYLE = [
  { id: 'background', type: 'background' },
  { id: 'water', type: 'fill' },
  { id: 'place-labels', type: 'symbol', layout: { 'text-field': ['get', 'name'] } },
  // Both sit above the first label layer in the real style too. `poi_r7` selects by rank alone, so
  // it draws transit stops next to every other kind of POI.
  { id: 'poi_transit', type: 'symbol', layout: { 'text-field': ['get', 'name'] } },
  { id: 'poi_r7', type: 'symbol', layout: { 'text-field': ['get', 'name'] }, filter: ['>=', ['get', 'rank'], 7] },
];

/** @param {ReturnType<typeof makeMap>} map */
const basemapPoiVisibility = (map) => map.getLayer('poi_transit')?.layout?.visibility;

/** The shape of the satellite basemap: raster only, no labels of its own. */
const RASTER_STYLE = [
  { id: 'satellite-tiles', type: 'raster' },
  { id: 'satellite-labels', type: 'raster' },
];

/** @param {ReturnType<typeof makeMap>} map */
const layerIds = (map) => map.layers.map((layer) => layer.id);

describe('overlayLayers', () => {
  describe('ensureOpenFreeMapSource', () => {
    it('adds the shared vector source once', () => {
      const map = makeMap();

      ensureOpenFreeMapSource(map);
      ensureOpenFreeMapSource(map);

      expect(map.sources[OPENFREEMAP_SOURCE_ID]).toEqual({ type: 'vector', url: OPENFREEMAP_TILEJSON_URL });
      expect(Object.keys(map.sources)).toHaveLength(1);
    });
  });

  describe('findFirstSymbolLayerId', () => {
    it('returns the first text symbol layer', () => {
      expect(findFirstSymbolLayerId(makeMap(LABELLED_STYLE))).toBe('place-labels');
    });

    it('returns undefined for a style without labels', () => {
      expect(findFirstSymbolLayerId(makeMap(RASTER_STYLE))).toBeUndefined();
    });

    it('ignores symbol layers that render no text', () => {
      const map = makeMap([{ id: 'icons-only', type: 'symbol', layout: { 'icon-image': 'dot' } }]);

      expect(findFirstSymbolLayerId(map)).toBeUndefined();
    });
  });

  describe('applyTransitLayers', () => {
    it('adds the source and the transit layers', () => {
      const map = makeMap(LABELLED_STYLE);

      applyTransitLayers(map, true);

      expect(map.sources[OPENFREEMAP_SOURCE_ID]).toBeDefined();
      expect(layerIds(map)).toEqual([
        'background',
        'water',
        ...TRANSIT_LAYER_IDS,
        'place-labels',
        'poi_transit',
        'poi_r7',
      ]);
    });

    it('reads rail lines and transit stops from the shared source', () => {
      const map = makeMap(RASTER_STYLE);

      applyTransitLayers(map, true);

      expect(map.added.map(({ layer }) => layer.id)).toEqual(TRANSIT_LAYER_IDS);
      for (const { layer } of map.added) {
        expect(layer.source).toBe(OPENFREEMAP_SOURCE_ID);
        expect(['transportation', 'poi']).toContain(layer['source-layer']);
      }
    });

    it('inserts the layers below the first label layer', () => {
      const map = makeMap(LABELLED_STYLE);

      applyTransitLayers(map, true);

      for (const { beforeId } of map.added) {
        expect(beforeId).toBe('place-labels');
      }
    });

    it('labels the stops itself on a style that has no labels', () => {
      const map = makeMap(RASTER_STYLE);

      applyTransitLayers(map, true);

      expect(layerIds(map)).toEqual(['satellite-tiles', 'satellite-labels', ...TRANSIT_LAYER_IDS]);
      for (const { beforeId } of map.added) {
        expect(beforeId).toBeUndefined();
      }
    });

    it('adds nothing twice when re-applied', () => {
      const map = makeMap(LABELLED_STYLE);

      applyTransitLayers(map, true);
      const afterFirstRun = layerIds(map);
      applyTransitLayers(map, true);

      expect(layerIds(map)).toEqual(afterFirstRun);
      expect(map.added).toHaveLength(TRANSIT_LAYER_IDS.length);
    });

    it('removes only its own layers and keeps the source', () => {
      const map = makeMap(RASTER_STYLE);
      applyTransitLayers(map, true);

      applyTransitLayers(map, false);

      expect(layerIds(map)).toEqual(['satellite-tiles', 'satellite-labels']);
      expect(map.sources[OPENFREEMAP_SOURCE_ID]).toBeDefined();
    });

    it("hides the basemap's own transit POIs while it is on, and restores them after", () => {
      const map = makeMap(LABELLED_STYLE);
      const originalPoiFilter = map.getFilter('poi_r7');

      applyTransitLayers(map, true);
      expect(basemapPoiVisibility(map)).toBe('none');
      // The rank layers stay, minus the stops the overlay now draws itself.
      expect(map.getFilter('poi_r7')).toEqual([
        'all',
        originalPoiFilter,
        ['!', ['match', ['get', 'class'], ['railway', 'rail', 'bus'], true, false]],
      ]);

      applyTransitLayers(map, false);
      expect(basemapPoiVisibility(map)).toBe('visible');
      expect(map.getFilter('poi_r7')).toEqual(originalPoiFilter);
    });

    it('narrows the basemap POI filter from the original, not from its own previous result', () => {
      const map = makeMap(LABELLED_STYLE);

      // A style reload re-applies the overlay repeatedly; the filter must not grow each time.
      applyTransitLayers(map, true);
      const afterFirstRun = map.getFilter('poi_r7');
      applyTransitLayers(map, true);

      expect(map.getFilter('poi_r7')).toEqual(afterFirstRun);
    });

    it('copes with a style that has no transit POIs of its own', () => {
      const map = makeMap(RASTER_STYLE);

      expect(() => applyTransitLayers(map, true)).not.toThrow();
      expect(() => applyTransitLayers(map, false)).not.toThrow();
    });

    it('marks the stops with an icon rather than a bare dot', () => {
      const map = makeMap(RASTER_STYLE);

      applyTransitLayers(map, true);
      const stops = map.getLayer(TRANSIT_STOPS_LAYER_ID);

      expect(stops.type).toBe('symbol');
      expect(stops.layout['icon-image']).toEqual(
        expect.arrayContaining(['match', expect.arrayContaining(['get', 'class'])]),
      );
      // Every stop stays clickable, so none may be dropped by collision.
      expect(stops.layout['icon-allow-overlap']).toBe(true);
    });

    it('is a no-op when disabled twice', () => {
      const map = makeMap(LABELLED_STYLE);
      applyTransitLayers(map, true);
      applyTransitLayers(map, false);

      expect(() => applyTransitLayers(map, false)).not.toThrow();
      expect(layerIds(map)).toEqual(['background', 'water', 'place-labels', 'poi_transit', 'poi_r7']);
    });
  });

  describe('applyBuildingsLayer', () => {
    it('adds and removes the 3D layer below the labels', () => {
      const map = makeMap(LABELLED_STYLE);

      applyBuildingsLayer(map, true);
      expect(layerIds(map)).toEqual([
        'background',
        'water',
        BUILDINGS_LAYER_ID,
        'place-labels',
        'poi_transit',
        'poi_r7',
      ]);
      expect(map.added[0].beforeId).toBe('place-labels');

      applyBuildingsLayer(map, false);
      expect(layerIds(map)).toEqual(['background', 'water', 'place-labels', 'poi_transit', 'poi_r7']);
    });

    it('coexists with the transit overlay on a single shared source', () => {
      const map = makeMap(LABELLED_STYLE);

      applyBuildingsLayer(map, true);
      applyTransitLayers(map, true);

      expect(Object.keys(map.sources)).toEqual([OPENFREEMAP_SOURCE_ID]);
      expect(layerIds(map)).toContain(BUILDINGS_LAYER_ID);
      expect(layerIds(map)).toEqual(expect.arrayContaining(['transit-lines', 'transit-stops']));

      // Turning one off leaves the other alone.
      applyTransitLayers(map, false);
      expect(layerIds(map)).toEqual([
        'background',
        'water',
        BUILDINGS_LAYER_ID,
        'place-labels',
        'poi_transit',
        'poi_r7',
      ]);
    });
  });
});
