/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The `shape` parameter of a drawn search area, in the two flavours ImmoScout hands it over in.
 */

/**
 * A `shape` parameter carrying base64 rather than a bare polyline.
 *
 * ImmoScout writes the payload URL-safe, so besides the standard alphabet the value may contain `-`
 * and `_`, and the padding arrives as `.` instead of `=` - up to two of them trailing the payload.
 * @type {RegExp}
 */
const BASE64_SHAPE_PATTERN = /^[A-Za-z0-9+/_-]+\.{0,2}$/;

/**
 * The alphabet of a Google Encoded Polyline. Every character is a 5 bit chunk plus a continuation
 * bit plus 63, so the whole string lives between `?` and `~`. Digits, `+` and `=` can therefore
 * never appear in one, and none of `?@[\]^{|}~` can appear in base64, which is what tells the two
 * shape flavours apart.
 *
 * `_` is the one character both alphabets share, so admitting it above costs some of that
 * separation - a raw polyline containing `_` is now offered to the decoder. Nothing is lost by it:
 * a decode is only kept when it is itself a valid polyline, and `-` cannot occur in a polyline at
 * all, so admitting that one is free.
 * @type {RegExp}
 */
const POLYLINE_PATTERN = /^[\x3f-\x7e]+$/;

/**
 * The URL-safe substitutions to undo, most likely first.
 *
 * ImmoScout maps `+` to `_` - confirmed against the `lastSearchApiUrl` its own search pages embed,
 * where a shape carrying `_` resolves to a polyline byte of `0x7e`. Reading that `_` as base64url's
 * `/` instead yields `0x7f`, one past the end of the polyline alphabet, and the mobile API answers
 * `500`. The counterpart `-` never showed up in a sample, hence the base64url candidate behind it.
 * @type {Array<Array<[RegExp, string]>>}
 */
const URL_SAFE_ALPHABETS = [
  [
    [/_/g, '+'],
    [/-/g, '/'],
  ],
  [
    [/-/g, '+'],
    [/_/g, '/'],
  ],
  [],
];

/**
 * The polyline behind a web URL's `shape` parameter.
 *
 * The parameter looks the same either way: links from the map editor carry the polyline base64
 * wrapped, while a shape drawn by hand arrives raw. Decoding a raw one does not fail loudly.
 * `Buffer.from(x, 'base64')` silently drops every character outside the base64 alphabet, and the
 * bytes left over are not valid UTF-8, so the shape reaches the mobile API as a run of U+FFFD
 * (`%EF%BF%BD` once encoded) and it answers `400 Cannot parse shape`. Decoding is therefore only
 * attempted when the input could be base64 at all, and the result is only kept when it decodes to
 * something a polyline could be. That check is also what makes trying more than one alphabet safe.
 *
 * @param {string} shape Raw value of the web URL's `shape` query parameter.
 * @returns {string} The polyline to hand to the mobile API.
 */
export function toPolyline(shape) {
  if (!BASE64_SHAPE_PATTERN.test(shape)) return shape;

  const padded = shape.replace(/\.\./g, '==').replace(/\./g, '=');

  for (const substitutions of URL_SAFE_ALPHABETS) {
    // `Buffer.from(x, 'base64')` reads `-` and `_` as base64url on its own, so the substitutions
    // have to be applied rather than relied upon.
    const candidate = substitutions.reduce((value, [from, to]) => value.replace(from, to), padded);
    const decoded = Buffer.from(candidate, 'base64').toString('utf-8');
    if (POLYLINE_PATTERN.test(decoded)) return decoded;
  }

  return shape;
}
