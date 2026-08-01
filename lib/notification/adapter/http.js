/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readAdapterReadme } from '../../services/markdown.js';
import { toPriceChangeListing } from '../priceChangeMessage.js';

const mapListing = (listing, baseUrl) => ({
  address: listing.address,
  description: listing.description,
  id: listing.id,
  imageUrl: listing.image,
  price: listing.price,
  size: listing.size,
  title: listing.title,
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
    timeout: 10000,
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

  const fetchOptions = { method: 'POST', headers, timeout: 10000, body: JSON.stringify(body) };
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
    },
  },
};
