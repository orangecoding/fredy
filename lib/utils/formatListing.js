/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { formatTravelTimes } from './formatTravelTimes.js';

/** @import { ParsedListing } from '../types/listing.js' */

/**
 * @typedef {Omit<import('../types/listing.js').ParsedListing, 'price' | 'size' | 'rooms'> & {
 *   price: string | null,
 *   size: string | null,
 *   rooms: string | null,
 *   commute: string | null,
 * }} FormattedListing
 */

/**
 * The word for "rooms" per UI language.
 *
 * The unit used to be hard-coded as "Zimmer", so every notification was German however the user
 * had set the interface. Currency and area carry no language, so only this one needs a table.
 * An unknown language falls back to English rather than to German.
 * @type {Record<string, string>}
 */
const ROOMS_LABEL = {
  de: 'Zimmer',
  en: 'rooms',
  tr: 'Odalar',
};

/**
 * Formats a listing's numerical fields (price, size, rooms) into strings with their respective units.
 *
 * @param {import('../types/listing.js').ParsedListing} listing The original listing object.
 * @param {string} [language='en'] UI language of the job's owner, as stored in their settings.
 * @returns {FormattedListing} A copy of the listing with formatted strings for price, size, and rooms.
 */
export const formatListing = (listing, language = 'en') => {
  const rooms = ROOMS_LABEL[language] ?? ROOMS_LABEL.en;
  return {
    ...listing,
    price: listing.price != null ? `${listing.price} €` : null,
    size: listing.size != null ? `${listing.size} m²` : null,
    rooms: listing.rooms != null ? `${listing.rooms} ${rooms}` : null,
    // Null unless a router actually answered for this listing. Adapters drop it with the same
    // `filter(Boolean)` they already use for a missing price, so a listing whose travel times are
    // not computed yet reads exactly as it did before this feature existed.
    commute: formatTravelTimes(listing.travelTimes, language),
  };
};

/**
 * Headline wording per direction and UI language.
 *
 * Adapters render wildly different message formats, so the one thing they must not each reinvent is
 * the phrasing of what happened - a "price change" that turns out to be an increase reads as a
 * trick if only the notification's own layout distinguishes the two.
 * @type {Record<string, {down: string, up: string}>}
 */
const PRICE_CHANGE_LABEL = {
  de: { down: 'Preis gesenkt', up: 'Preis erhöht' },
  en: { down: 'Price reduced', up: 'Price increased' },
  tr: { down: 'Fiyat düştü', up: 'Fiyat arttı' },
};

/**
 * @typedef {Object} PriceChange
 * @property {import('../types/listing.js').ParsedListing} listing The listing, with its new price already applied.
 * @property {number} oldPrice
 * @property {number} newPrice
 * @property {number} changePercent Signed, negative for a reduction.
 * @property {'up'|'down'} direction
 */

/**
 * @typedef {import('./formatListing.js').FormattedListing & {
 *   oldPrice: string,
 *   newPrice: string,
 *   changePercent: string,
 *   direction: 'up'|'down',
 *   changeHeadline: string,
 * }} FormattedPriceChange
 */

/**
 * Format a price change for a notification adapter.
 *
 * Returns a {@link FormattedListing} - so an adapter can render it with the exact code path it
 * already uses for a new listing - plus the change itself as pre-formatted strings. Adapters must
 * not compute the percentage themselves; rounding it in seventeen places is seventeen chances to
 * disagree about what the same change was.
 *
 * @param {PriceChange} change
 * @param {string} [language='en'] UI language of the job's owner.
 * @returns {FormattedPriceChange}
 */
export const formatPriceChange = (change, language = 'en') => {
  const labels = PRICE_CHANGE_LABEL[language] ?? PRICE_CHANGE_LABEL.en;
  const percent = Math.abs(change.changePercent).toFixed(1);
  return {
    ...formatListing(change.listing, language),
    oldPrice: `${change.oldPrice} €`,
    newPrice: `${change.newPrice} €`,
    // Signed and with the unit, so an adapter can drop it straight into a line of text.
    changePercent: `${change.changePercent < 0 ? '-' : '+'}${percent} %`,
    direction: change.direction,
    changeHeadline: labels[change.direction],
  };
};
