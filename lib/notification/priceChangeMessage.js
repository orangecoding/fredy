/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** @import { FormattedPriceChange } from '../utils/formatListing.js' */

/**
 * One-line summary of a price change, for use as a notification title or subject.
 *
 * Both prices appear because the delta alone is not actionable - "8% off" says nothing about
 * whether the flat is now affordable - and the direction is spelled out in words rather than left
 * to a sign, since a minus buried in a push notification is easy to miss.
 *
 * @param {FormattedPriceChange} change
 * @returns {string}
 */
export const priceChangeTitle = (change) =>
  `${change.changeHeadline}: ${change.oldPrice} -> ${change.newPrice} (${change.changePercent})`;

/**
 * The detail lines beneath the summary.
 *
 * Kept identical across adapters on purpose: a user with both e-mail and push configured should not
 * have to work out whether the two are describing the same event.
 *
 * @param {FormattedPriceChange} change
 * @param {string} [baseUrl] Fredy's own base URL, when configured.
 * @returns {string}
 */
export const priceChangeBody = (change, baseUrl) => {
  const lines = [
    change.title,
    change.address ? `Address: ${change.address}` : null,
    change.size ? `Size: ${change.size}` : null,
    change.rooms ? `Rooms: ${change.rooms}` : null,
    change.link ? `Link: ${change.link}` : null,
    baseUrl && change.id ? `Open in Fredy: ${baseUrl}/#/listings/listing/${change.id}` : null,
  ];
  return lines.filter(Boolean).join('\n');
};

/**
 * Title and body joined, for adapters that take a single blob of text.
 *
 * @param {FormattedPriceChange} change
 * @param {string} [baseUrl]
 * @returns {string}
 */
export const priceChangeText = (change, baseUrl) => `${priceChangeTitle(change)}\n${priceChangeBody(change, baseUrl)}`;

/**
 * Reshape a price change so it can go through a listing-shaped renderer.
 *
 * The e-mail adapters share one Handlebars template built around a listing card. Giving price
 * changes their own template would mean a second layout to keep in step with the first for the sake
 * of one differing field, so instead the change is folded into the two fields that carry it: the
 * headline goes in front of the title, and the price cell shows the move rather than a single
 * number.
 *
 * @param {FormattedPriceChange} change
 * @returns {Object} A listing-shaped object.
 */
export const toPriceChangeListing = (change) => ({
  ...change,
  title: `${change.changeHeadline}: ${change.title}`,
  price: `${change.oldPrice} -> ${change.newPrice} (${change.changePercent})`,
});
