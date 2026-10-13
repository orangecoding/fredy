/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** @import { ListingImage } from '../types/listing.js' */

const MAX_IMAGES = 20;

/**
 * Builds a listing's `images` from pictures a provider already has: absolute urls only, each once,
 * at most {@link MAX_IMAGES}. Floor plans go first, so the cap never cuts them.
 *
 * @param {Array<string|{url?: string, caption?: string}>} [pictures] Urls, or urls with a caption.
 * @returns {ListingImage[]}
 */
export function toListingImages(pictures) {
  const seen = new Set();
  const images = [];
  for (const picture of Array.isArray(pictures) ? pictures : []) {
    const { url, caption } = typeof picture === 'string' ? { url: picture } : (picture ?? {});
    if (typeof url !== 'string' || !/^https?:\/\//.test(url) || seen.has(url)) continue;
    seen.add(url);
    const text = typeof caption === 'string' ? caption.trim() : '';
    images.push({ url, ...(text ? { caption: text } : {}), ...(/grundriss/i.test(text) ? { floorPlan: true } : {}) });
  }
  const floorPlans = images.filter((image) => image.floorPlan);
  return [...floorPlans, ...images.filter((image) => !image.floorPlan)].slice(0, MAX_IMAGES);
}
