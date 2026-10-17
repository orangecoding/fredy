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

/**
 * Path endings that are a script rather than a file. Behind one of these the query names the
 * picture (`image.php?id=12`), so it cannot be dropped from the key.
 */
const SCRIPT_PATH = /\.(php|aspx?|jsp|cgi)$/i;

/**
 * What identifies a picture regardless of the rendition a url asks for.
 *
 * Portals hand out one picture in several sizes, and the search result and the detail page rarely
 * ask for the same one: ImmoScout's title picture is `.../ORIG/resize/800x600>/...` in the search
 * and `.../ORIG/resize/1500x1000/...` in the exposé, Deutsche Wohnen's is `?width=324&crop=4:3`
 * against `?width=960`. The key is host and path without the query and without the rendition part
 * of the path (`/ORIG/...` on ImmoScout, `/-/...` on uploadcare).
 *
 * @param {string} url
 * @returns {string}
 */
export function pictureKey(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const path = parsed.pathname.replace(/\/ORIG\/.*$/i, '').replace(/\/-\/.*$/, '');
  return `${parsed.host}${path}${SCRIPT_PATH.test(path) ? parsed.search : ''}`.toLowerCase();
}

/**
 * The gallery without the listing's own first picture, whichever rendition either of them asks for.
 *
 * Matched by {@link pictureKey}, but only where exactly one gallery picture has the first picture's
 * key: a key several pictures share does not identify a picture on that CDN, and there only the
 * exact url is the same picture.
 *
 * @param {ListingImage[]} images
 * @param {string|null|undefined} firstUrl The listing's `image`, or its stored `image_url`.
 * @returns {ListingImage[]}
 */
export function withoutFirstPicture(images, firstUrl) {
  if (typeof firstUrl !== 'string' || firstUrl.length === 0) return images;
  const key = pictureKey(firstUrl);
  const sameKey = images.filter((image) => pictureKey(image.url) === key);
  if (sameKey.length === 1) return images.filter((image) => image !== sameKey[0]);
  return images.filter((image) => image.url !== firstUrl);
}
