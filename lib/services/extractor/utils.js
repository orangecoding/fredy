/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../logger.js';

let debuggingOn = false;

export const DEFAULT_HEADER = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
};

export const setDebug = (options) => {
  debuggingOn = !!options?.debug;
};

export const debug = (message) => {
  if (debuggingOn) {
    logger.debug(message);
  }
};

/**
 * How long a document naming a CloudFront request may be and still be a refusal.
 *
 * CloudFront's own block page is a handful of lines that end in the request's id, and that id is
 * the only thing such a page has to say. A portal's results page can mention the same header for a
 * completely different reason: casa.it echoes the request headers it was served with into the state
 * it ships to the browser, so every one of its pages carries an `x-amz-cf-id` and every one of them
 * looked like a bot wall. Length is what separates the refusal from the results.
 */
const CLOUDFRONT_ERROR_MAX_LENGTH = 4096;

/** Phrases that mean a wall wherever they appear, however long the page is. */
const BOT_WALL_PATTERNS = [/verify you are human/i, /access denied/i];

export const botDetected = (pageSource, statusCode) => {
  const suspiciousStatusCodes = [403, 429];

  const detectedInSource =
    BOT_WALL_PATTERNS.some((pattern) => pattern.test(pageSource)) ||
    (String(pageSource ?? '').length <= CLOUDFRONT_ERROR_MAX_LENGTH && /x-amz-cf-id/i.test(pageSource));
  const detectedByStatus = suspiciousStatusCodes.includes(statusCode);

  return detectedInSource || detectedByStatus;
};
