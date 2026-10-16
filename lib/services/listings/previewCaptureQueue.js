/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../logger.js';
import { compressPreview, fetchListingPicture } from './listingPictures.js';
import { getPreviewState, markListingPreviewFailed, storeListingPreview } from '../storage/listingMediaStorage.js';

/**
 * Keeping the first picture of a listing, in the background.
 *
 * Fed from two places: the pipeline, for every new listing that survived its filters, and the image
 * route, for a listing stored before pictures were kept (the lazy backfill). Neither waits for it -
 * a notification must never be late because a CDN is slow, and the route answers with a redirect to
 * the portal in the meantime.
 *
 * In memory on purpose. A capture lost to a restart is not lost for good: the next time anybody
 * looks at that listing, the route queues it again.
 */

/** A picture that could not be kept is asked for again after this long, not on every page view. */
export const PREVIEW_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

/** Downloads running at the same time. Gentle on the CDNs, and on a Raspberry Pi. */
const CONCURRENCY = 2;

/**
 * Most captures waiting at once. Scrolling through an overview of old listings queues one per row;
 * beyond this the rest simply wait for the next time they are looked at.
 */
const MAX_QUEUED = 500;

/** @type {Array<{listingId: string, imageUrl: string}>} */
const queue = [];

/** Listing ids queued or running, so one picture is never fetched twice at the same time. */
const pending = new Set();

/** @type {Array<() => void>} */
let idleWaiters = [];

let running = 0;

/**
 * Queue the first picture of a listing to be kept.
 *
 * Cheap and synchronous: whether the picture is already stored, or failed recently, is decided when
 * its turn comes rather than here.
 *
 * @param {string} listingId The listing's database id.
 * @param {string|null|undefined} imageUrl The portal's url of the picture (`listings.image_url`).
 * @returns {boolean} Whether the capture was queued.
 */
export function enqueuePreviewCapture(listingId, imageUrl) {
  if (!listingId || typeof imageUrl !== 'string' || !/^https?:\/\//i.test(imageUrl)) return false;
  if (pending.has(listingId) || queue.length >= MAX_QUEUED) return false;
  pending.add(listingId);
  queue.push({ listingId, imageUrl });
  drain();
  return true;
}

/**
 * Resolves once nothing is queued or running. For tests and shutdown, never awaited by the pipeline.
 *
 * @returns {Promise<void>}
 */
export function whenPreviewCapturesIdle() {
  if (running === 0 && queue.length === 0) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}

/**
 * Start captures until {@link CONCURRENCY} run.
 *
 * @returns {void}
 */
function drain() {
  while (running < CONCURRENCY && queue.length > 0) {
    const job = queue.shift();
    running++;
    capture(job).finally(() => {
      running--;
      pending.delete(job.listingId);
      drain();
      if (running === 0 && queue.length === 0) {
        const waiters = idleWaiters;
        idleWaiters = [];
        waiters.forEach((resolve) => resolve());
      }
    });
  }
}

/**
 * Download, shrink and store one picture. Never throws: a picture is a nicety next to the listing,
 * and a failure is recorded so it is not retried before {@link PREVIEW_RETRY_AFTER_MS}.
 *
 * @param {{listingId: string, imageUrl: string}} job
 * @returns {Promise<void>}
 */
async function capture({ listingId, imageUrl }) {
  try {
    const { hasPreview, failedAt } = getPreviewState(listingId);
    if (hasPreview || (failedAt != null && Date.now() - failedAt < PREVIEW_RETRY_AFTER_MS)) return;

    const picture = await fetchListingPicture(imageUrl);
    const { content, mimeType } = await compressPreview(picture.buffer, picture.mimeType);
    storeListingPreview(listingId, content, mimeType);
  } catch (error) {
    logger.debug(`Could not keep the picture of listing ${listingId}: ${error.message}`);
    try {
      markListingPreviewFailed(listingId);
    } catch {
      // The listing is gone by now (the foreign key refuses the row), so there is nothing to mark.
    }
  }
}
