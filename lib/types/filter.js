/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * @typedef {Object} SpecFilter
 * @property {number} [minRooms] Minimum number of rooms.
 * @property {number} [minSize] Minimum size in m².
 * @property {number} [maxPrice] Maximum price.
 */

/**
 * @typedef {Object} SpatialFilter GeoJSON FeatureCollection.
 * @property {Array<Object>} [features] GeoJSON features for spatial filtering (typically Polygons).
 * @property {string} [type] Type 'FeatureCollection'.
 */

export {};
