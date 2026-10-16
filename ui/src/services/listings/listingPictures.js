/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Where the interface loads the first picture of a listing from: Fredy's own route, never the
 * portal directly. The route serves the copy Fredy keeps in its database, which outlives the advert,
 * and redirects to the portal for a listing whose copy is not kept yet (queuing it on the way).
 *
 * Null for a listing without any picture, so the caller shows its placeholder straight away instead
 * of making a request that can only end in a 404.
 *
 * @param {Object} listing
 * @param {string} [listing.id]
 * @param {string|null} [listing.image_url]
 * @returns {string|null}
 */
export function listingPictureSrc(listing) {
  if (listing?.id == null || !listing.image_url) return null;
  return `/api/listings/${encodeURIComponent(listing.id)}/image`;
}

/**
 * @typedef {Object} GalleryPicture
 * @property {string} src What an `<img>` loads.
 * @property {string|null} caption The portal's caption, where it has one.
 * @property {boolean} floorPlan Whether the picture is a floor plan.
 */

/**
 * Every picture of a listing in viewing order: the first picture, the remaining photos, then the
 * floor plans.
 *
 * Storage keeps the floor plans in front, so the cap of twenty can never cut them; that is an order
 * for keeping, not for looking, and a gallery opening on a floor plan reads as a broken one.
 *
 * @param {Object} listing A listing as the detail route returns it.
 * @param {Array<{url: string, caption?: string, floorPlan?: boolean}>} [listing.images]
 * @returns {GalleryPicture[]}
 */
export function galleryPictures(listing) {
  const first = listingPictureSrc(listing);
  const images = (Array.isArray(listing?.images) ? listing.images : []).filter(
    (image) => typeof image?.url === 'string' && image.url.length > 0,
  );
  const ordered = [...images.filter((image) => !image.floorPlan), ...images.filter((image) => image.floorPlan)];
  return [
    ...(first == null ? [] : [{ src: first, caption: null, floorPlan: false }]),
    ...ordered.map((image) => ({
      src: image.url,
      caption: image.caption ?? null,
      floorPlan: image.floorPlan === true,
    })),
  ];
}
