/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Repaints the labels of the dark basemap, which its own style ships too dark to read.
 *
 * Measured against the shipped style, on its own `rgb(12,12,12)` background:
 *
 * | Layer | Shipped colour | Contrast |
 * |---|---|---|
 * | `place_*` (cities, towns, suburbs) | `rgb(101,101,101)` | 3,4 to 1 |
 * | `highway_name_other` (street names) | `rgba(80,78,78,1)` | 2,5 to 1 |
 * | `highway_name_motorway` | `hsl(0,0%,37%)` | 2,9 to 1 |
 * | `water_name` | `hsla(0,0%,0%,0.7)` | black on black |
 *
 * All four under AA, the last one invisible. The style is drawn for a map that fills a screen and
 * is looked at; here it sits behind pins that have to be found by street name.
 *
 * ## Why only the labels, and not the background
 *
 * The map also had to get lighter overall, and that is done with a canvas filter in `Map.less`
 * (`.map-shell--lift`), not here. The reason is that this style is calibrated around its
 * background: `building` is `rgb(10,10,10)`, `highway_minor` is `#181818`, `landuse_residential`
 * is `hsl(0,2%,5%)` - every one of them *lighter* than the `rgb(12,12,12)` behind it, by a little.
 * Raising the background alone inverts that: the roads and buildings end up darker than the land
 * they sit on, and the map reads as black lines on grey. A filter moves the whole composite
 * together and keeps the figure against its ground.
 *
 * What a filter cannot do is move the labels *differently* from everything else, which is the
 * whole problem: `contrast()` below 1 lifts the background by pulling every channel towards the
 * middle, and it pulls the labels towards that same middle. So the labels are set here, bright
 * enough that they still clear AA once the filter has compressed them - the ratios in the table
 * below are the ones that reach the screen, not the ones these literals have on their own.
 *
 * | Label | Set here | After the filter, on the lifted background |
 * |---|---|---|
 * | places | `#dcd5cd` | 9,5 to 1 |
 * | roads | `#b3a9a0` | 6,4 to 1 |
 * | water | `#a8bccd` | 7,3 to 1 |
 *
 * MapLibre paint cannot read a custom property, so these are literals, which `AGENTS.md` allows
 * for map layers. Warm greys off the application's palette rather than the style's neutral ones.
 *
 * @type {Readonly<Record<string, string|number>>}
 */
export const DARK_BASEMAP_PAINT = Object.freeze({
  /** Cities, towns, villages, suburbs, states, countries: the brightest step. */
  placeLabel: '#dcd5cd',
  /** Street and motorway names, a step below the places - that step is the hierarchy. */
  roadLabel: '#b3a9a0',
  /** Rivers and lakes, cool rather than warm so water still reads as water. */
  waterLabel: '#a8bccd',
  /** Under every label, so a name crossing a road or a railway keeps its own edge. */
  halo: '#0f0d0c',
  haloWidth: 1.2,
});

/**
 * The canvas filter the labels above have to survive, as its two numbers.
 *
 * Kept next to the colours because the two only make sense together: change the filter in
 * `Map.less` and these literals stop being the contrast they claim. `test/ui/mapTheme.test.js`
 * computes the ratios through this and fails if any of them drops under AA.
 *
 * @type {Readonly<{contrast: number, backdrop: string}>}
 */
export const DARK_BASEMAP_LIFT = Object.freeze({
  /** Matches `filter: contrast(...)` on `.map-shell--lift .maplibregl-canvas`. */
  contrast: 0.82,
  /** The style's own background, which the filter lifts and the labels are measured against. */
  backdrop: '#0c0c0c',
});

/**
 * Which of the three label colours a basemap layer gets, by its id.
 *
 * Matched on the id rather than the source layer, because that is what the style hands us and
 * OpenMapTiles' naming is stable: `place_*` for anything named on land, `highway_name_*` for the
 * roads, `water_name` for the water.
 *
 * @param {string} id
 * @returns {string|null} The colour, or `null` for a layer this does not touch.
 */
function labelColorFor(id) {
  if (id.startsWith('place_')) return DARK_BASEMAP_PAINT.placeLabel;
  if (id.startsWith('highway_name') || id.startsWith('highway-name')) return DARK_BASEMAP_PAINT.roadLabel;
  if (id.startsWith('water_name')) return DARK_BASEMAP_PAINT.waterLabel;
  return null;
}

/**
 * Applies {@link DARK_BASEMAP_PAINT} to the basemap currently loaded on `map`.
 *
 * Runs on every `styledata`, like the overlays, because `setStyle()` reloads the style from source
 * and takes every paint change with it. Nothing has to be undone when it stops applying, for the
 * same reason: a bright basemap or satellite is a different style document.
 *
 * Leaves the overlays alone. `transit-stop-labels` is a text symbol layer too, and it already
 * carries the pair of colours that follows the basemap's brightness - repainting it here would
 * overwrite that with the basemap's own hierarchy. Told apart by their source: the overlays read
 * from ours, the basemap from its own.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {boolean} enabled Whether the basemap on screen is the dark one.
 * @param {string} overlaySourceId The overlays' source, whose layers are skipped.
 */
export function applyDarkBasemapPaint(map, enabled, overlaySourceId) {
  if (!enabled) return;

  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.source === overlaySourceId) continue;
    if (layer.type !== 'symbol' || layer.layout?.['text-field'] == null) continue;

    const color = labelColorFor(layer.id);
    if (color == null) continue;

    map.setPaintProperty(layer.id, 'text-color', color);
    map.setPaintProperty(layer.id, 'text-halo-color', DARK_BASEMAP_PAINT.halo);
    map.setPaintProperty(layer.id, 'text-halo-width', DARK_BASEMAP_PAINT.haloWidth);
  }
}
