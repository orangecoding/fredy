/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

const LAGECHECK_BASE = 'https://lagecheck.com/check';

/**
 * A deep link into Lagecheck for one listing.
 *
 * Lagecheck places a point, so the coordinates are what the link is made of: without both there is
 * nothing to check and the caller gets `null` to hide the whole block rather than a link that lands
 * on an empty map. The address is only the label Lagecheck shows above its result, so a listing
 * whose address never resolved still links fine without it.
 *
 * -1 is the geocoder's "looked, found nothing" rather than a position off West Africa, and it is
 * rejected here rather than only at the call site so the helper cannot hand anyone a link to the
 * wrong continent.
 *
 * @param {Object} listing
 * @param {number} [listing.latitude]
 * @param {number} [listing.longitude]
 * @param {string} [listing.address]
 * @returns {string|null} The URL, or null when the listing has no coordinates.
 */
export function lagecheckUrl({ latitude, longitude, address } = {}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude === -1 || longitude === -1) {
    return null;
  }

  const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude) });
  if (typeof address === 'string' && address.trim().length > 0) {
    params.set('address', address.trim());
  }

  return `${LAGECHECK_BASE}?${params.toString()}`;
}
