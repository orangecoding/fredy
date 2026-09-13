/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The android app's property detail api, the one place the portal states what a search does not.
 *
 * The search endpoints answer an advert without its description and without its dates - the fields
 * a card on the website needs are simply not in the payload. The app asks a different host for the
 * advert whole, and that answer carries both. It sits behind nothing: a plain request with a
 * browser's user agent is answered like any other, so reading it costs neither a browser nor a
 * trip through the bot wall the rendered detail page sits behind.
 */

import logger from '../logger.js';

/** Where the android app asks for one property. */
const PROPERTY_DETAIL_URL = 'https://android-imm-v4.ws-app.com/b2c/v2/properties/';

/**
 * The number the portal calls an advert by, as a listing link spells it out.
 * @type {RegExp}
 */
const ADVERT_ID_IN_LINK = /\/annunci\/(\d+)\//;

/**
 * Read the advert id out of a listing link.
 *
 * The detail api is addressed by this number and the listing only carries its link, so the reading
 * lives here next to the api it serves rather than at the call site.
 *
 * @param {string|undefined|null} link a listing link (`https://www.immobiliare.it/annunci/131916338/`)
 * @returns {string|null} the advert id, or null when the link names no advert
 */
export function advertIdInLink(link) {
  return link?.match(ADVERT_ID_IN_LINK)?.[1] ?? null;
}

/**
 * Both this api and the search endpoint are asked in a browser's voice - a bare node agent is what
 * a bot guard looks for, and what neither of the two forgives.
 * @type {string}
 */
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/**
 * Ask the app's api for one property, whole.
 *
 * @param {string|number} propertyId the number the portal calls the advert by, as it appears in a
 *   listing link (`/annunci/131916338/`)
 * @returns {Promise<any|null>} the detail payload, or null when the api refused or answered nothing
 *   readable - callers treat that as "nothing to add" rather than as a failure
 */
export async function fetchPropertyDetail(propertyId) {
  try {
    const response = await fetch(`${PROPERTY_DETAIL_URL}${propertyId}`, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    logger.debug(`Immobiliare.it: property ${propertyId} could not be read (${error?.message}).`);
    return null;
  }
}

/**
 * Read the description text out of a detail payload.
 *
 * The text sits under `description.content` next to an internal reference that is not for showing.
 * An advert whose owner wrote none carries the wrapper with an empty content, which reads as null -
 * there is no text to be had, and pretending otherwise would put an empty paragraph on the listing.
 *
 * @param {any} detail one answer of {@link fetchPropertyDetail}
 * @returns {string|null} the description, or null when the advert carries none
 */
export function detailDescription(detail) {
  const content = detail?.description?.content;
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : null;
}
