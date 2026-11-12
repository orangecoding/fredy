/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readAdapterReadme } from '../../services/markdown.js';
import { toPriceChangeListing } from '../priceChangeMessage.js';

/**
 * `{ [key]: value }` when the value is known, `{}` otherwise.
 *
 * Every field below is optional on a listing: a portal may not state it, or the step that would
 * produce it (provider details, geocoding, the market benchmark) may be switched off. Leaving the key
 * out keeps "not known" apart from a real value, the same way `commute` and `images` already do.
 *
 * @param {string} key
 * @param {any} value
 * @returns {object}
 */
const whenKnown = (key, value) => (value == null || value === '' ? {} : { [key]: value });

/**
 * The market benchmark Fredy attached after storing the listing, or nothing when it has none.
 *
 * @param {object} listing
 * @returns {object}
 */
const marketOf = (listing) =>
  listing.market_median_sqm == null
    ? {}
    : {
        market: {
          medianPricePerSqm: listing.market_median_sqm,
          ...whenKnown('sampleSize', listing.market_sample_size),
          ...whenKnown('radiusKm', listing.market_radius_km),
        },
      };

const mapListing = (listing, baseUrl) => ({
  address: listing.address,
  description: listing.description,
  id: listing.id,
  imageUrl: listing.image,
  price: listing.price,
  size: listing.size,
  title: listing.title,
  // Absent rather than null when nothing was routed, so a consumer cannot mistake "not looked up"
  // for a journey of no length.
  ...(listing.commute ? { commute: listing.commute } : {}),
  ...(listing.images?.length > 0 ? { images: listing.images } : {}),
  // What the listing knows beyond the card. Build year and energy class mostly arrive with provider
  // details enabled, the coordinates with geocoding and the market figures with the benchmark.
  // `rooms` is formatted like `price` and `size`; the others are sent as they are.
  ...whenKnown('rooms', listing.rooms),
  ...whenKnown('buildYear', listing.buildYear),
  ...whenKnown('energyClass', listing.energyClass),
  ...whenKnown('currency', listing.currency),
  ...whenKnown('chargesIncluded', listing.chargesIncluded),
  ...whenKnown('charges', listing.charges),
  ...whenKnown('publishedAt', listing.publishedAt == null ? null : new Date(listing.publishedAt).toISOString()),
  ...(listing.latitude != null && listing.longitude != null
    ? { latitude: listing.latitude, longitude: listing.longitude }
    : {}),
  ...marketOf(listing),
  url: listing.link,
  fredyUrl: baseUrl && listing.id ? `${baseUrl}/#/listings/listing/${listing.id}` : null,
});

export const send = async ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const { authToken, endpointUrl, selfSignedCerts } = notificationConfig.find((a) => a.id === config.id).fields;

  const listings = newListings.map((l) => mapListing(l, baseUrl));
  const body = {
    jobId: jobKey,
    timestamp: new Date().toISOString(),
    provider: serviceName,
    listings,
  };

  const headers = {
    'Content-Type': 'application/json',
  };
  if (authToken != null) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  let fetchOptions = {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify(body),
  };

  if (selfSignedCerts === true) {
    fetchOptions.dispatcher = new (await import('undici')).Agent({
      connect: { rejectUnauthorized: false },
    });
  }

  return fetch(endpointUrl, fetchOptions);
};

/**
 * Posts price changes to the same endpoint as new listings, under an explicit `event` discriminator.
 *
 * The payload gains a field rather than reusing `listings` silently: a receiver written before this
 * existed keeps parsing what it always did, and one written after can tell the two events apart
 * without guessing from the shape.
 *
 * @param {{serviceName: string, priceChanges: any[], notificationConfig: any[], jobKey: string, baseUrl: string}} params
 * @returns {Promise<any>}
 */
export const sendPriceChange = async ({ serviceName, priceChanges, notificationConfig, jobKey, baseUrl }) => {
  const { authToken, endpointUrl, selfSignedCerts } = notificationConfig.find((a) => a.id === config.id).fields;

  const body = {
    event: 'priceChange',
    jobId: jobKey,
    timestamp: new Date().toISOString(),
    provider: serviceName,
    priceChanges: priceChanges.map((change) => ({
      ...mapListing(toPriceChangeListing(change), baseUrl),
      oldPrice: change.oldPrice,
      newPrice: change.newPrice,
      changePercent: change.changePercent,
      direction: change.direction,
    })),
  };

  const headers = { 'Content-Type': 'application/json' };
  if (authToken != null) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const fetchOptions = { method: 'POST', headers, signal: AbortSignal.timeout(10000), body: JSON.stringify(body) };
  if (selfSignedCerts === true) {
    fetchOptions.dispatcher = new (await import('undici')).Agent({ connect: { rejectUnauthorized: false } });
  }

  return fetch(endpointUrl, fetchOptions);
};

export const config = {
  id: 'http',
  name: 'HTTP',
  readme: readAdapterReadme('http.md'),
  description: 'Fredy will send a generic HTTP POST request.',
  fields: {
    endpointUrl: {
      description: "Your application's endpoint URL.",
      label: 'Endpoint URL',
      type: 'text',
      // Shown as the channel's destination in the UI.
      target: true,
    },
    selfSignedCerts: {
      label: 'Self-signed certificates',
      type: 'boolean',
    },
    authToken: {
      description: "Your application's auth token, if required by your endpoint.",
      label: 'Auth token (optional)',
      optional: true,
      type: 'text',
      // Never leaves the server for anyone who may not edit this channel.
      secret: true,
    },
  },
};
