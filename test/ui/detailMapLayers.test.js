/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  applyRouteLayers,
  buildRouteData,
  removeRouteLayers,
  ROUTE_LABEL_LAYER_ID,
  ROUTE_LINE_LAYER_ID,
  ROUTE_SOURCE_ID,
} from '../../ui/src/views/listings/detailMapLayers.js';

/**
 * The same kind of stand-in `mapOverlayLayers.test.js` uses: only the style methods these helpers
 * touch, recording what happened so the assertions can read the resulting style. No DOM.
 */
function makeMap() {
  const sources = {};
  const layers = [];

  return {
    layers,
    sources,
    getSource: (id) => sources[id],
    addSource: (id, spec) => {
      sources[id] = { ...spec, setData: (data) => (sources[id].data = data) };
    },
    removeSource: (id) => {
      if (!(id in sources)) throw new Error(`removeSource called for missing source ${id}`);
      delete sources[id];
    },
    getLayer: (id) => layers.find((layer) => layer.id === id),
    addLayer: (layer) => layers.push(layer),
    removeLayer: (id) => {
      const index = layers.findIndex((layer) => layer.id === id);
      if (index === -1) throw new Error(`removeLayer called for missing layer ${id}`);
      layers.splice(index, 1);
    },
  };
}

const LISTING = { latitude: 51.2277, longitude: 6.7735 };

const HOMES = [
  { label: 'Work', coords: { lat: 51.2377, lng: 6.7735 } },
  { label: '', coords: { lat: 51.2177, lng: 6.7835 } },
];

const layerIds = (map) => map.layers.map((layer) => layer.id);

describe('detailMapLayers', () => {
  describe('buildRouteData', () => {
    it('emits a line and a label per reference address', () => {
      const data = buildRouteData(LISTING, HOMES);

      expect(data.type).toBe('FeatureCollection');
      expect(data.features).toHaveLength(4);
      expect(data.features.map((feature) => feature.geometry.type)).toEqual([
        'LineString',
        'Point',
        'LineString',
        'Point',
      ]);
    });

    it('draws each line from the listing to that address', () => {
      const [line] = buildRouteData(LISTING, HOMES).features;

      expect(line.geometry.coordinates).toEqual([
        [LISTING.longitude, LISTING.latitude],
        [HOMES[0].coords.lng, HOMES[0].coords.lat],
      ]);
    });

    it('labels the midpoint with the rounded distance, prefixed by the address label', () => {
      const [, label] = buildRouteData(LISTING, HOMES).features;

      expect(label.geometry.coordinates[0]).toBeCloseTo(6.7735, 6);
      expect(label.geometry.coordinates[1]).toBeCloseTo(51.2327, 6);
      expect(label.properties.distance).toMatch(/^Work: \d+ m$/);
    });

    it('leaves out the prefix when the address has no label', () => {
      const [, , , label] = buildRouteData(LISTING, HOMES).features;

      expect(label.properties.distance).toMatch(/^\d+ m$/);
    });

    it('produces nothing without reference addresses', () => {
      expect(buildRouteData(LISTING, []).features).toEqual([]);
      expect(buildRouteData(LISTING, undefined).features).toEqual([]);
    });
  });

  describe('applyRouteLayers', () => {
    it('adds the source and both layers', () => {
      const map = makeMap();

      applyRouteLayers(map, buildRouteData(LISTING, HOMES));

      expect(map.getSource(ROUTE_SOURCE_ID)).toBeDefined();
      expect(layerIds(map)).toEqual([ROUTE_LINE_LAYER_ID, ROUTE_LABEL_LAYER_ID]);
    });

    it('splits the two layers by geometry type', () => {
      const map = makeMap();

      applyRouteLayers(map, buildRouteData(LISTING, HOMES));

      expect(map.getLayer(ROUTE_LINE_LAYER_ID).filter).toEqual(['==', '$type', 'LineString']);
      expect(map.getLayer(ROUTE_LABEL_LAYER_ID).filter).toEqual(['==', '$type', 'Point']);
    });

    // A style change drops every custom layer, so this runs again on each `styledata`.
    it('updates the existing source instead of adding the layers twice', () => {
      const map = makeMap();
      applyRouteLayers(map, buildRouteData(LISTING, HOMES));

      const nextData = buildRouteData(LISTING, [HOMES[0]]);
      applyRouteLayers(map, nextData);

      expect(layerIds(map)).toEqual([ROUTE_LINE_LAYER_ID, ROUTE_LABEL_LAYER_ID]);
      expect(map.getSource(ROUTE_SOURCE_ID).data).toBe(nextData);
    });

    it('takes the route back off when there is nothing left to draw', () => {
      const map = makeMap();
      applyRouteLayers(map, buildRouteData(LISTING, HOMES));

      applyRouteLayers(map, buildRouteData(LISTING, []));

      expect(layerIds(map)).toEqual([]);
      expect(map.getSource(ROUTE_SOURCE_ID)).toBeUndefined();
    });

    it('does nothing without a map', () => {
      expect(() => applyRouteLayers(null, buildRouteData(LISTING, HOMES))).not.toThrow();
    });
  });

  describe('removeRouteLayers', () => {
    it('is safe when nothing was ever added', () => {
      const map = makeMap();

      expect(() => removeRouteLayers(map)).not.toThrow();
      expect(layerIds(map)).toEqual([]);
    });

    // The layers reference the source, so they have to go first or MapLibre refuses.
    it('removes the layers before the source', () => {
      const map = makeMap();
      applyRouteLayers(map, buildRouteData(LISTING, HOMES));

      expect(() => removeRouteLayers(map)).not.toThrow();
      expect(map.sources).toEqual({});
    });
  });
});
