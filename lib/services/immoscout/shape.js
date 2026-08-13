/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The `shape` parameter of a drawn search area, in the two flavours ImmoScout hands it over in.
 */

/**
 * A `shape` parameter carrying base64 rather than a bare polyline. The web UI writes the padding as
 * `.` instead of `=`, so up to two of them may trail the payload.
 * @type {RegExp}
 */
const BASE64_SHAPE_PATTERN = /^[A-Za-z0-9+/]+\.{0,2}$/;

/**
 * The alphabet of a Google Encoded Polyline. Every character is a 6 bit chunk plus 63, so the whole
 * string lives between `?` and `~`. Digits, `+` and `=` can therefore never appear in one, and none
 * of `?@[\]^_{|}~` can appear in base64, which is what makes the two shape flavours tellable apart
 * without having to ask ImmoScout which one it sent.
 * @type {RegExp}
 */
const POLYLINE_PATTERN = /^[\x3f-\x7e]+$/;

/**
 * The polyline behind a web URL's `shape` parameter.
 *
 * The parameter looks the same either way: links from the map editor carry the polyline base64
 * wrapped, while a shape drawn by hand arrives raw. Decoding a raw one does not fail loudly.
 * `Buffer.from(x, 'base64')` silently drops every character outside the base64 alphabet, and the
 * bytes left over are not valid UTF-8, so the shape reaches the mobile API as a run of U+FFFD
 * (`%EF%BF%BD` once encoded) and it answers `400 Cannot parse shape`. Decoding is therefore only
 * attempted when the input could be base64 at all, and the result is only kept when it decodes to
 * something a polyline could be.
 *
 * @param {string} shape Raw value of the web URL's `shape` query parameter.
 * @returns {string} The polyline to hand to the mobile API.
 */
export function toPolyline(shape) {
  if (!BASE64_SHAPE_PATTERN.test(shape)) return shape;

  const decoded = Buffer.from(shape.replace(/\.\./g, '==').replace(/\./g, '='), 'base64').toString('utf-8');
  return POLYLINE_PATTERN.test(decoded) ? decoded : shape;
}
