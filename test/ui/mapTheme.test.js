/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { findOverlayInsertionId, OVERLAY_PAINT } from '../../ui/src/components/map/overlayLayers.js';
import { DARK_BASEMAP_LIFT, DARK_BASEMAP_PAINT } from '../../ui/src/components/map/darkBasemapPaint.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

/**
 * WCAG relative luminance of a `#rrggbb` string.
 *
 * Spelled out here rather than imported: the map colours are MapLibre paint literals and have no
 * stylesheet to measure them in, so the only way to hold a contrast claim to account is to compute
 * it from the constants themselves.
 *
 * @param {string} hex
 * @returns {number}
 */
function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Contrast ratio between two `#rrggbb` strings, per WCAG 2.1.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function contrastRatio(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/**
 * A colour as `filter: contrast(c)` leaves it, which is what actually reaches the screen on the
 * dark basemap. CSS applies it per channel around the midpoint: `out = (in - 0.5) * c + 0.5`.
 *
 * @param {string} hex
 * @param {number} c
 * @returns {string}
 */
function afterContrast(hex, c) {
  const out = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    const lifted = Math.min(1, Math.max(0, (value - 0.5) * c + 0.5));
    return Math.round(lifted * 255)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${out.join('')}`;
}

/** Contrast of a basemap label against its background, both as the canvas filter leaves them. */
function liftedRatio(hex) {
  const { contrast, backdrop } = DARK_BASEMAP_LIFT;
  return contrastRatio(afterContrast(hex, contrast), afterContrast(backdrop, contrast));
}

const mapJsx = read('ui/src/components/map/Map.jsx');
const mapLess = read('ui/src/components/map/Map.less');
const viewJsx = read('ui/src/views/listings/Map.jsx');
const viewLess = read('ui/src/views/listings/Map.less');
const popup = read('ui/src/views/listings/listingPopupContent.jsx');
const actions = read('ui/src/views/listings/components/MapPopupActions.jsx');
const darkPaint = read('ui/src/components/map/darkBasemapPaint.js');
const search = read('ui/src/components/map/MapSearch.jsx');
const legendLess = read('ui/src/components/map/MapLegend.less');
const actionsLess = read('ui/src/views/listings/components/MapPopupActions.less');

/** @param {Array<{id: string, type: string, layout?: object}>} layers */
const styleOf = (layers) => ({ getStyle: () => ({ layers }) });

describe('the overlays are inserted above the geometry, not above the first label', () => {
  // OpenFreeMap's `bright`, reduced to the shape that matters: geometry, then a symbol layer that
  // is not a label (road_oneway carries a text-field but renders an arrow glyph), then the labels.
  it('answers the same thing on a bright-shaped style as before', () => {
    const id = findOverlayInsertionId(
      styleOf([
        { id: 'background', type: 'background' },
        { id: 'building', type: 'fill' },
        { id: 'highway-motorway', type: 'line' },
        { id: 'boundary_disputed', type: 'line' },
        { id: 'road_oneway', type: 'symbol', layout: { 'text-field': ['get', 'oneway'] } },
        { id: 'label_city', type: 'symbol', layout: { 'text-field': ['get', 'name'] } },
      ]),
    );
    expect(id).toBe('road_oneway');
  });

  // `dark` labels its water at position 9 of 47, long before it draws a single road. The old rule
  // returned water_name and buried the transit lines under the basemap.
  it('does not bury the overlays under the roads on a dark-shaped style', () => {
    const id = findOverlayInsertionId(
      styleOf([
        { id: 'background', type: 'background' },
        { id: 'water', type: 'fill' },
        { id: 'water_name', type: 'symbol', layout: { 'text-field': ['get', 'name'] } },
        { id: 'building', type: 'fill' },
        { id: 'highway_motorway_inner', type: 'line' },
        { id: 'railway', type: 'line' },
        { id: 'boundary_country_z5-', type: 'line' },
        { id: 'place_other', type: 'symbol', layout: { 'text-field': ['get', 'name'] } },
      ]),
    );
    expect(id).toBe('place_other');
    expect(id).not.toBe('water_name');
  });

  it('still returns nothing for a raster style', () => {
    expect(findOverlayInsertionId(styleOf([{ id: 'satellite', type: 'raster' }]))).toBeUndefined();
  });

  // The detail page draws its route before the transit overlay arrives, and the map view adds a
  // distance ring. Neither is basemap geometry: counted as such, they moved the anchor above every
  // label or past the end of the style, and the overlays then covered the street names.
  it('ignores the layers Fredy adds itself', () => {
    const map = {
      getStyle: () => ({
        sources: {
          openmaptiles: { type: 'vector' },
          openfreemap: { type: 'vector' },
          route: { type: 'geojson' },
          'distance-circle': { type: 'geojson' },
        },
        layers: [
          { id: 'background', type: 'background' },
          { id: 'highway', type: 'line', source: 'openmaptiles' },
          { id: 'place_city', type: 'symbol', source: 'openmaptiles', layout: { 'text-field': ['get', 'name'] } },
          { id: 'route-line', type: 'line', source: 'route' },
          { id: 'distance-circle', type: 'fill', source: 'distance-circle' },
          { id: 'transit-stops', type: 'symbol', source: 'openfreemap', layout: { 'text-field': ['get', 'name'] } },
        ],
      }),
    };
    expect(findOverlayInsertionId(map)).toBe('place_city');
  });
});

describe('both paint variants are complete', () => {
  it('defines every key in both', () => {
    expect(Object.keys(OVERLAY_PAINT.dark).sort()).toEqual(Object.keys(OVERLAY_PAINT.light).sort());
  });

  it('shares no colour between them, which would mean one was forgotten', () => {
    for (const key of Object.keys(OVERLAY_PAINT.light)) {
      if (key.endsWith('Opacity')) continue;
      expect(OVERLAY_PAINT.dark[key], key).not.toBe(OVERLAY_PAINT.light[key]);
    }
  });
});

describe('the basemap follows the theme, the dimmer follows the basemap', () => {
  it('loads a different style per theme, and only for the vector basemap', () => {
    expect(mapJsx).toMatch(/styles\/bright/);
    expect(mapJsx).toMatch(/styles\/dark/);
    expect(mapJsx).toMatch(/export function isDarkBasemap/);
    expect(mapJsx).toMatch(/styleValue === 'SATELLITE'/);
  });

  it('dims by a class rather than by the theme, because satellite is bright in both', () => {
    expect(mapLess).toMatch(/&--dim \.maplibregl-canvas/);
    expect(mapLess).not.toMatch(/theme-mode/);
    expect(mapJsx).toMatch(/map-shell--dim/);
  });

  it('lifts the whole composite, not just the background, so roads stay lighter than the land', () => {
    // The style is calibrated around its own background - building is rgb(10,10,10), against
    // rgb(12,12,12) behind it. Raising only the background inverts every one of those pairs.
    expect(mapLess).toMatch(/&--lift \.maplibregl-canvas/);
    expect(mapJsx).toMatch(/map-shell--lift/);
    expect(darkPaint).not.toMatch(/background-color/);
  });

  it('keeps the filter in Map.less and the number the labels are measured against in step', () => {
    const declared = mapLess.match(/&--lift \.maplibregl-canvas \{\s*filter: contrast\(([\d.]+)\)/);
    expect(declared, 'the lift filter is declared as contrast(...)').not.toBeNull();
    expect(Number(declared[1])).toBe(DARK_BASEMAP_LIFT.contrast);
  });

  it('repaints the dark basemap labels on every style load, like the overlays', () => {
    // setStyle() reloads the style from source and drops every paint change with it.
    expect(mapJsx).toMatch(/applyDarkBasemapPaint\(mapRef\.current, isDark, OPENFREEMAP_SOURCE_ID\)/);
    expect(mapJsx).toMatch(/\}, \[isDark, styleValue\]\);/);
  });

  it('gives every dark basemap label AA once the filter has compressed it', () => {
    // The shipped style manages 3,4 to 1 for places and 2,5 to 1 for street names, which is what
    // this replaces. Measured after the filter, because that is what reaches the screen.
    for (const key of ['placeLabel', 'roadLabel', 'waterLabel']) {
      const ratio = liftedRatio(DARK_BASEMAP_PAINT[key]);
      expect(ratio, `${key} measures ${ratio.toFixed(2)} to 1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the places brighter than the roads, which is the hierarchy', () => {
    expect(liftedRatio(DARK_BASEMAP_PAINT.placeLabel)).toBeGreaterThan(liftedRatio(DARK_BASEMAP_PAINT.roadLabel));
  });

  it('leaves the transit overlay its own stop colours, which follow the basemap', () => {
    // transit-stop-labels is a text symbol layer too; repainting it here would overwrite the pair
    // from OVERLAY_PAINT with the basemap's hierarchy.
    expect(darkPaint).toMatch(/layer\.source === overlaySourceId/);
    const ratio = liftedRatio(OVERLAY_PAINT.dark.stopLabel);
    expect(ratio, `stop labels measure ${ratio.toFixed(2)} to 1`).toBeGreaterThanOrEqual(4.5);
  });

  it('restyles and repaints on a theme change', () => {
    expect(mapJsx).toMatch(/\}, \[styleValue, theme\]\);/);
    expect(mapJsx).toMatch(/paintVariant/);
  });
});

describe('the page', () => {
  it('has one panel with two named groups instead of two identical boxes', () => {
    expect(viewJsx).toMatch(/map\.groupMap/);
    expect(viewJsx).toMatch(/map\.groupListings/);
    expect(viewJsx).toMatch(/map-panel__divider/);
  });

  it('carries the fullscreen toggle on the first heading, not floating above the box', () => {
    expect(viewJsx).toMatch(/panels=\{\(controls, expandButton\) =>/);
    expect(viewJsx).toMatch(/\{t\('map\.groupMap'\)\}\s*\{expandButton\}/);
    // The map renders it itself only where no panel took it.
    expect(mapJsx).toMatch(/\{!controlsInPanels && expandButton\}/);
    // Smaller in there than on the map, and it needs two classes to beat Semi's own height.
    expect(mapLess).toMatch(/&__groupTitle \{[\s\S]*?\.map-shell__expand \{[\s\S]*?height: 24px/);
  });

  it('says why a filter is locked instead of banning a strip across the map', () => {
    expect(viewJsx).not.toMatch(/<Banner/);
    expect(viewJsx).toMatch(/disabled=\{!hasHome\}/);
    expect(viewJsx).toMatch(/map-panel__hint/);
  });

  it('formats both ends of the price slider', () => {
    expect(viewJsx).toMatch(/formatEuroCompact\(priceRange\[0\]/);
    expect(viewJsx).not.toMatch(/<span>\{priceRange\[0\]\}<\/span>/);
  });

  it('explains its pin colours', () => {
    expect(viewJsx).toMatch(/<MapLegend/);
  });
});

describe('the popup', () => {
  it('installs nothing on window', () => {
    expect(viewJsx).not.toMatch(/window\.deleteListing/);
    expect(viewJsx).not.toMatch(/window\.viewDetails/);
    expect(popup).not.toMatch(/onclick=/);
  });

  it('makes the title a link that may take two lines', () => {
    expect(popup).toMatch(/map-popup-content__title/);
    expect(popup).not.toMatch(/<h4>/);
    expect(viewLess).toMatch(/-webkit-line-clamp: 2/);
  });

  it('has one colour, not two reds side by side', () => {
    expect(viewLess).not.toMatch(/__linkButton|__detailsButton|__deleteButton/);
    expect(actions).toMatch(/Dropdown/);
    expect(actions).toMatch(/type="danger"/);
  });

  it('closes its own menu, because Semi does not', () => {
    // Without clickToHide the menu stayed open on top of the deletion dialog it had just opened.
    // Third menu of this shape in the app; ListingActions and JobActions carry the same flag.
    expect(actions).toMatch(/clickToHide/);
  });

  it('does not route through a router context it has no access to', () => {
    // mountPopupNode creates its own React root outside the router, so useNavigate would throw.
    expect(actions).not.toMatch(/useNavigate/);
    expect(actions).toMatch(/onNavigate/);
  });

  it('escapes what it interpolates', () => {
    for (const field of ['title', 'address', 'job_name']) {
      expect(popup, field).toMatch(new RegExp(`escapeHtml\\(listing\\.${field}`));
    }
  });

  it('takes Semi’s palette out of the map stylesheet', () => {
    expect(viewLess).not.toMatch(/--semi-color|--semi-shadow/);
  });

  it('gives the close button a size and a surface, because it sits on the photograph', () => {
    // MapLibre ships it transparent at the very corner, where it vanished into whatever the
    // listing photo happened to be behind it.
    expect(viewLess).toMatch(/\.maplibregl-popup-close-button \{[\s\S]*?width: 28px/);
    expect(viewLess).toMatch(/\.maplibregl-popup-close-button \{[\s\S]*?background: rgba\(0, 0, 0/);
  });

  it('does not put a focus ring on the heading every time it opens', () => {
    // MapLibre focuses the first a[href] in a popup on open, and that is the title link now.
    expect(viewJsx).toMatch(/focusAfterOpen: false/);
    // Keyboard focus still shows, in the app's colour rather than the browser's blue.
    expect(viewLess).toMatch(/&:focus-visible \{[\s\S]*?outline: 2px solid @color-info/);
    expect(viewLess).toMatch(/&:focus \{\s*outline: none;/);
  });

  it('still hands the keyboard a way in, by focusing the popup itself', () => {
    // A popup is appended after every marker, so from the marker that opened it the tab order
    // runs through all the others first. Without this its contents are unreachable in practice.
    expect(popup).toMatch(/element\.tabIndex = -1/);
    expect(viewJsx).toMatch(/element\.focus\(\{ preventScroll: true \}\)/);
  });
});

describe('the view state survives a trip to a detail page and back', () => {
  it('keeps the open popup in the address bar, by listing id', () => {
    expect(viewJsx).toMatch(/popup: \{ defaultValue: null, codec: parseString \}/);
    expect(viewJsx).toMatch(/popup: openListingId/);
  });

  it('reopens it on the page of the stack it was left on', () => {
    // The id, not the pin: it says which of a stacked group was showing as well as which pin.
    expect(popup).toMatch(/initialId/);
    expect(popup).toMatch(/listings\.findIndex\(\(listing\) => listing\.id === initialId\)/);
    expect(viewJsx).toMatch(/initialId: holdsOpenListing\(\)/);
    expect(viewJsx).toMatch(/reopen\.togglePopup\(\)/);
  });

  // Reopening after a rebuild follows a filter change; focusing the popup then pulled the focus out
  // of the control the user was operating.
  it('does not take the focus when it reopens the popup itself', () => {
    expect(viewJsx).toMatch(/reopeningRef\.current = true;/);
    expect(viewJsx).toMatch(/if \(!reopeningRef\.current\) \{\s*element\.focus/);
  });

  // A click from one pin onto another opens and closes in one tick; the old popup's close must see
  // that it is no longer the open one.
  it('records the newly open popup before the old one closes', () => {
    expect(viewJsx).toMatch(/openListingIdRef\.current = id \?\? null;\s*setUrlValue\('popup', id \?\? null\);/);
  });

  it('reports the page turn, so the address bar names what is on screen', () => {
    expect(popup).toMatch(/onPageChange\?\.\(listings\[index\]\.id\)/);
  });

  it('tells a person closing the popup apart from the map being torn down', () => {
    // MapLibre reports both as `close`. Clearing the param on a teardown is what overwrote the
    // detail page's history entry with the map's, because the write is a replace.
    expect(viewJsx).toMatch(/isTearingDownRef/);
    expect(viewJsx).toMatch(/if \(isTearingDownRef\.current \|\| !holdsOpenListing\(\)\) return;/);
  });

  it('does not rebuild every marker when a popup opens', () => {
    // The open id is read through a ref on purpose: as a dependency it would tear down the popup
    // that had just been opened.
    expect(viewJsx).toMatch(/openListingIdRef/);
    const deps = viewJsx.match(/\}, \[listings, priceRange, homeAddresses, distanceFilter, commuteFilter, isDark\]\);/);
    expect(deps, 'the marker effect keeps its dependency list').not.toBeNull();
  });

  it('keeps a price floor that arrived without a ceiling', () => {
    // `?priceMin=300000` alone used to be reset to zero here, because the listings-loaded effect
    // rewrote both ends whenever priceMax happened to be absent.
    expect(viewJsx).toMatch(/setPriceRange\(\[urlPriceMin \?\? 0, getMaxPrice\(\)\]\)/);
  });
});

describe('the address search on the map', () => {
  it('is offered by the map and switched on per view', () => {
    // Off by default: a map showing one listing has nothing to search for, and the job form's
    // area filter brings its own box scoped to the providers ticked in it.
    expect(mapJsx).toMatch(/searchable = false/);
    expect(viewJsx).toMatch(/^\s*searchable$/m);
  });

  it('sits top left, above MapLibre’s own controls rather than behind them', () => {
    expect(mapJsx).toMatch(/map-shell__search/);
    expect(mapLess).toMatch(/&__search \{/);
    // The search element comes after the map container in the DOM, so no sibling selector can
    // reach back to MapLibre's control corner; a modifier on the shell can.
    expect(mapJsx).toMatch(/map-shell--searchable/);
    expect(mapLess).toMatch(/&--searchable \.maplibregl-ctrl-top-left/);
  });

  it('travels into the fullscreen overlay, because it sits inside the shell', () => {
    // Rendered as a child of `.map-shell`, which is the element that goes fixed and full-viewport.
    expect(mapJsx).toMatch(/\{searchable && \(\s*<div className="map-shell__search">/);
  });

  it('waits for a pause in typing, because Nominatim rate-limits hard', () => {
    expect(search).toMatch(/debounce\(/);
    expect(search).toMatch(/300/);
    expect(search).toMatch(/MIN_QUERY_LENGTH/);
  });

  it('locates what was typed on Enter, not only what was suggested', () => {
    // Nominatim's completion is patchy on new streets, so the typed text has to be usable.
    expect(search).toMatch(/event\.key !== 'Enter'/);
    // On a wrapper, not through AutoComplete's own onKeyDown prop: Semi only forwards that from a
    // handler on its own outer element, once it has bound keyboard events.
    expect(search).toMatch(/<div\s+className="mapSearch"\s+onKeyDown=/);
  });

  it('asks the two endpoints for the two different jobs', () => {
    // Suggesting is for choosing and answers with names; geocoding costs a lookup and only the
    // chosen address pays it.
    expect(search).toMatch(/\/api\/user\/settings\/autocomplete\?q=/);
    expect(search).toMatch(/\/api\/user\/settings\/geocode\?q=/);
    // Neither names its countries: the server falls back to the union across the user's jobs,
    // which is the same reach the map itself has.
    expect(search).not.toMatch(/providers=/);
  });

  it('marks the hit with one pin, moved rather than multiplied', () => {
    expect(mapJsx).toMatch(/searchMarkerRef/);
    expect(mapJsx).toMatch(/clearSearchResult/);
    expect(mapJsx).toMatch(/MARKER_COLORS\.pick/);
  });

  it('stays out of the view state, unlike the filters and the open popup', () => {
    // Where you are looking and what you are looking for are different decisions; the camera is
    // not in the URL either.
    expect(viewJsx).not.toMatch(/search: \{ defaultValue/);
    expect(search).not.toMatch(/useUrlState|setSearchParams/);
  });
});

describe('spacing comes from the scale', () => {
  const SPACING =
    /^\s*(gap|row-gap|column-gap|margin|margin-top|margin-right|margin-bottom|margin-left|padding|padding-top|padding-right|padding-bottom|padding-left):\s*([^;]+);/gm;

  /**
   * Every spacing declaration in the two new stylesheets whose value is not built from the scale.
   *
   * Only the new files: Map.less and the map view's stylesheet carry older rules in rem and in
   * pixels that this plan does not touch, and a failing assertion about those would be noise.
   *
   * @param {string} text
   * @returns {string[]}
   */
  function offenders(text) {
    const bad = [];
    for (const match of text.replace(/\s*!important/g, '').matchAll(SPACING)) {
      for (const part of match[2].trim().split(/\s+/)) {
        if (!/^(0|auto|@space-\d+|\d+px)$/.test(part)) bad.push(match[0].trim());
      }
    }
    return bad;
  }

  it('holds for the two stylesheets this plan adds', () => {
    expect(offenders(legendLess)).toEqual([]);
    expect(offenders(actionsLess)).toEqual([]);
  });
});
