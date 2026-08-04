/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Decoder for Google's encoded polyline format, which is how MOTIS ships route geometry.
 *
 * Written out rather than pulled in as a dependency: the algorithm is twenty lines, and the usual
 * package defaults to five decimal places while MOTIS encodes at seven. Getting that wrong does not
 * fail loudly - it puts the route in the Gulf of Guinea - so the precision is a required argument
 * here rather than something with a convenient default.
 *
 * @param {string} encoded
 * @param {number} precision - Decimal places the coordinates were encoded at. MOTIS reports this
 * per geometry as `legGeometry.precision`.
 * @returns {Array<[number, number]>} `[lng, lat]` pairs, in GeoJSON order.
 */
export function decodePolyline(encoded, precision) {
  if (typeof encoded !== 'string' || encoded.length === 0 || !Number.isFinite(precision)) {
    return [];
  }

  const factor = 10 ** precision;
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;
}

/**
 * The precision MOTIS encodes route geometry at.
 *
 * Carried in the response as `legGeometry.precision`, but the backend only stores the string, so
 * this is where the two ends agree on how to read it.
 */
export const MOTIS_POLYLINE_PRECISION = 7;
