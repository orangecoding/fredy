/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFileSync } from 'fs';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

/**
 * GREIX house-price growth lookup for Berlin.
 *
 * Replaces the Bodenrichtwert lookup: BRW values land, GREIX tracks the price of the
 * built real estate itself. Each listing position is matched against the 13 exact GREIX
 * regions (`greix_berlin.geojson`, extracted from greix.de's embedded map data) and the
 * region's index series (`greix_index.json`, converted from GREIX.csv, base year 2000 =
 * 100) yields the CAGR over the full 2000-2025 span:
 * `cagr = (index2025 / index2000) ^ (1 / 25) - 1`.
 *
 * Rules:
 * 1. Load once and cache (same pattern as the old brw lookup).
 * 2. First containing polygon wins; the 13 regions are disjoint, so at most one matches.
 * 3. Positions outside all regions (or missing coordinates) yield nulls, which score 0
 *    growth points - exactly like a missing BRW history did.
 *
 * Coordinates are [lon, lat] everywhere inside, matching GeoJSON.
 */

let cachedRegions = null;
let cachedCagr = null;

function loadRegions() {
  if (cachedRegions) return cachedRegions;
  const raw = JSON.parse(readFileSync(new URL('./data/greix_berlin.geojson', import.meta.url), 'utf8'));
  cachedRegions = (raw.features ?? [])
    .map((feature) => {
      const geometry = feature?.geometry;
      if (geometry?.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) return null;
      const rings = geometry.coordinates;
      if (rings.length === 0) return null;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const ring of rings) {
        for (const [x, y] of ring) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      return {
        region: feature.properties?.region ?? null,
        greixName: feature.properties?.greix_name ?? null,
        rings,
        bbox: [minX, minY, maxX, maxY],
      };
    })
    .filter(Boolean);
  return cachedRegions;
}

/**
 * CAGR per region over the full index series, keyed by the CSV column name.
 * @returns {Map<string, {cagr: number|null, indexCurrent: number|null, indexBase: number|null, fromYear: number, toYear: number}>}
 */
function loadCagr() {
  if (cachedCagr) return cachedCagr;
  cachedCagr = new Map();
  const raw = JSON.parse(readFileSync(new URL('./data/greix_index.json', import.meta.url), 'utf8'));
  const years = raw.years ?? [];
  const fromYear = years[0];
  const toYear = years[years.length - 1];
  for (const [region, series] of Object.entries(raw.values ?? {})) {
    if (!Array.isArray(series) || series.length < 2) {
      cachedCagr.set(region, { cagr: null, indexCurrent: null, indexBase: null, fromYear, toYear });
      continue;
    }
    const base = series[0];
    const current = series[series.length - 1];
    const span = toYear - fromYear;
    const cagr = base > 0 && span > 0 ? Math.pow(current / base, 1 / span) - 1 : null;
    cachedCagr.set(region, { cagr, indexCurrent: current, indexBase: base, fromYear, toYear });
  }
  return cachedCagr;
}

/**
 * Look up the GREIX price growth for a position.
 *
 * @param {number|null|undefined} latitude Degrees.
 * @param {number|null|undefined} longitude Degrees.
 * @returns {{region: string|null, greixName: string|null, cagr: number|null, indexCurrent: number|null, indexBase: number|null, fromYear: number|null, toYear: number|null}}
 */
export function lookupGreix(latitude, longitude) {
  const empty = {
    region: null,
    greixName: null,
    cagr: null,
    indexCurrent: null,
    indexBase: null,
    fromYear: null,
    toYear: null,
  };
  if (latitude == null || longitude == null) return empty;
  const point = [longitude, latitude];
  const cagrByRegion = loadCagr();
  for (const candidate of loadRegions()) {
    const [minX, minY, maxX, maxY] = candidate.bbox;
    if (point[0] < minX || point[0] > maxX || point[1] < minY || point[1] > maxY) continue;
    if (!booleanPointInPolygon(point, { type: 'Polygon', coordinates: candidate.rings })) continue;
    const figures = cagrByRegion.get(candidate.region) ?? {};
    return {
      region: candidate.region,
      greixName: candidate.greixName,
      cagr: figures.cagr ?? null,
      indexCurrent: figures.indexCurrent ?? null,
      indexBase: figures.indexBase ?? null,
      fromYear: figures.fromYear ?? null,
      toYear: figures.toYear ?? null,
    };
  }
  return empty;
}

/** Test seam: drop the cached regions/figures so tests can reload. @returns {void} */
export function _resetGreixCache() {
  cachedRegions = null;
  cachedCagr = null;
}
