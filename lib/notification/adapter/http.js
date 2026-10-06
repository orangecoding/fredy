/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readAdapterReadme } from '../../services/markdown.js';
import { toPriceChangeListing } from '../priceChangeMessage.js';
import logger from '../../services/logger.js';

/**
 * How long the endpoint may take. Native `fetch` has no `timeout` option (node-fetch did),
 * so this is enforced with an abort signal instead - without it a dead endpoint wedges the
 * pipeline at notify time with nothing in the logs to show for it.
 * @type {number}
 */
const ENDPOINT_TIMEOUT_MS = 10_000;

/**
 * Throw for anything the endpoint did not accept, carrying its own explanation.
 *
 * The pipeline discards adapter results but logs rejections, so this is what turns a silent
 * 500 on the other side into a Fredy ERROR line quoting the backend's message - the difference
 * between "scores stopped" and "scores stopped because ...".
 *
 * @param {Response} response
 * @param {string} endpointUrl
 * @returns {Promise<void>}
 * @throws {Error} When the response status is not ok, or the request failed.
 */
async function throwForUnaccepted(response, endpointUrl) {
  if (response.ok) return;
  let detail = '';
  try {
    detail = ` ${(await response.text()).slice(0, 500)}`;
  } catch {
    // A body that cannot be read is its own explanation.
  }
  throw new Error(`Endpoint ${endpointUrl} answered ${response.status}${detail}`);
}

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
    signal: AbortSignal.timeout(ENDPOINT_TIMEOUT_MS),
    body: JSON.stringify(body),
  };

  if (selfSignedCerts === true) {
    fetchOptions.dispatcher = new (await import('undici')).Agent({
      connect: { rejectUnauthorized: false },
    });
  }

  let response;
  try {
    response = await fetch(endpointUrl, fetchOptions);
  } catch (error) {
    logger.error(`Notification to ${endpointUrl} failed for job '${jobKey || ''}': ${error?.message || error}`);
    throw error;
  }
  await throwForUnaccepted(response, endpointUrl);
  return response;
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

  const fetchOptions = {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(ENDPOINT_TIMEOUT_MS),
    body: JSON.stringify(body),
  };
  if (selfSignedCerts === true) {
    fetchOptions.dispatcher = new (await import('undici')).Agent({ connect: { rejectUnauthorized: false } });
  }

  let response;
  try {
    response = await fetch(endpointUrl, fetchOptions);
  } catch (error) {
    logger.error(`Price-change notification to ${endpointUrl} failed: ${error?.message || error}`);
    throw error;
  }
  await throwForUnaccepted(response, endpointUrl);
  return response;
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
