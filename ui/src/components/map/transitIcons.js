/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The pictograms the transit overlay marks its stops with.
 *
 * They are drawn here rather than taken from the basemap's sprite because the overlay has to look
 * the same on both basemaps, and the satellite style ships no sprite at all. Rasterising two small
 * SVGs once per session is cheaper than making the overlay style-dependent.
 */

/** Id of the rail/train icon registered with the map. */
export const TRANSIT_RAIL_ICON = 'fredy-transit-rail';

/** Id of the bus icon registered with the map. */
export const TRANSIT_BUS_ICON = 'fredy-transit-bus';

/** Rendered at twice the display size so the icons stay sharp on retina screens. */
const ICON_SIZE = 44;
const ICON_PIXEL_RATIO = 2;

const RAIL_COLOR = '#2563eb';
const BUS_COLOR = '#059669';

/**
 * A round badge in the line's colour with a white pictogram, so a stop reads as a stop rather than
 * as a dot someone forgot to explain.
 *
 * @param {string} color - Badge fill.
 * @param {string} glyph - SVG markup of the white pictogram, drawn on the 44x44 canvas.
 * @returns {string}
 */
function badge(color, glyph) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 44 44">
    <circle cx="22" cy="22" r="19" fill="${color}" stroke="#ffffff" stroke-width="3"/>
    ${glyph}
  </svg>`;
}

const RAIL_SVG = badge(
  RAIL_COLOR,
  `<rect x="13" y="11" width="18" height="17" rx="4" fill="#ffffff"/>
   <rect x="16" y="14" width="12" height="6" rx="1.5" fill="${RAIL_COLOR}"/>
   <circle cx="17.5" cy="24" r="1.7" fill="${RAIL_COLOR}"/>
   <circle cx="26.5" cy="24" r="1.7" fill="${RAIL_COLOR}"/>
   <path d="M17 29 L13 33 M27 29 L31 33" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>`,
);

const BUS_SVG = badge(
  BUS_COLOR,
  `<rect x="12" y="12" width="20" height="15" rx="3" fill="#ffffff"/>
   <rect x="14.5" y="14.5" width="15" height="6" rx="1" fill="${BUS_COLOR}"/>
   <circle cx="16.5" cy="24" r="1.5" fill="${BUS_COLOR}"/>
   <circle cx="27.5" cy="24" r="1.5" fill="${BUS_COLOR}"/>
   <circle cx="17" cy="29" r="2.4" fill="#ffffff"/>
   <circle cx="27" cy="29" r="2.4" fill="#ffffff"/>`,
);

/**
 * Rasterises an SVG string. Decoding through an `Image` rather than `createImageBitmap` because
 * SVG blobs are not universally supported by the latter.
 *
 * @param {string} svg
 * @returns {Promise<ImageData>}
 */
async function rasterize(svg) {
  const image = new Image();
  image.decoding = 'async';
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, ICON_SIZE, ICON_SIZE);

  return context.getImageData(0, 0, ICON_SIZE, ICON_SIZE);
}

/**
 * Rasterised once per session, then re-registered with every style that needs them - `setStyle()`
 * drops the images along with everything else.
 * @type {Promise<Record<string, ImageData>>|null}
 */
let iconsPromise = null;

/**
 * Registers the stop pictograms with the map, unless they are already there.
 *
 * @param {import('maplibre-gl').Map} map
 * @returns {Promise<void>} Resolves once the icons can be referenced by a layer.
 */
export async function ensureTransitIcons(map) {
  if (map.hasImage(TRANSIT_RAIL_ICON) && map.hasImage(TRANSIT_BUS_ICON)) {
    return;
  }

  if (!iconsPromise) {
    iconsPromise = Promise.all([rasterize(RAIL_SVG), rasterize(BUS_SVG)]).then(([rail, bus]) => ({
      [TRANSIT_RAIL_ICON]: rail,
      [TRANSIT_BUS_ICON]: bus,
    }));
  }

  const icons = await iconsPromise;

  for (const [id, image] of Object.entries(icons)) {
    // Checked again: another style load may have added them while this promise was pending.
    if (!map.hasImage(id)) {
      map.addImage(id, image, { pixelRatio: ICON_PIXEL_RATIO });
    }
  }
}
