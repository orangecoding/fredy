/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import https from 'https';
import fetch from 'node-fetch';
import { readAdapterReadme } from '../../services/markdown.js';
import { toPriceChangeListing } from '../priceChangeMessage.js';

/**
 * The connection for an endpoint behind a self-signed certificate, with verification turned off.
 *
 * It takes `proxyEnv` from Node's global agent, the one every other request in Fredy goes through.
 * A hand-built agent does not inherit `NODE_USE_ENV_PROXY`, and neither did the undici dispatcher
 * this replaced, so these posts went out directly on a network that only lets a proxy through
 * (#535). One agent for every send, so its sockets are reused instead of a new pool per batch.
 */
const selfSignedHttpsAgent = new https.Agent({
  keepAlive: true,
  rejectUnauthorized: false,
  proxyEnv: https.globalAgent.options.proxyEnv,
});

/**
 * node-fetch asks for the agent per request URL, redirects included. Only https has a certificate
 * to relax; a plain http endpoint stays on the global agent, which is also where an https agent
 * would be refused.
 *
 * @param {URL} url
 * @returns {https.Agent|undefined}
 */
const selfSignedAgent = (url) => (url.protocol === 'https:' ? selfSignedHttpsAgent : undefined);

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
    fetchOptions.agent = selfSignedAgent;
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
    fetchOptions.agent = selfSignedAgent;
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
