/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { markdown2Html } from '../../services/markdown.js';

const mapListing = (listing) => ({
  address: listing.address,
  description: listing.description,
  id: listing.id,
  imageUrl: listing.image,
  price: listing.price,
  size: listing.size,
  title: listing.title,
  url: listing.link,
});

export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { authToken, endpointUrl } = notificationConfig.find((a) => a.id === config.id).fields;

  const listings = newListings.map(mapListing);
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

  return fetch(endpointUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body),
  });
};

export const config = {
  id: 'http',
  name: 'HTTP',
  readme: markdown2Html('lib/notification/adapter/http.md'),
  description: 'Fredy will send a generic HTTP POST request.',
  fields: {
    endpointUrl: {
      description: "Your application's endpoint URL.",
      label: 'Endpoint URL',
      type: 'text',
    },
    authToken: {
      description: "Your application's auth token, if required by your endpoint.",
      label: 'Auth token (optional)',
      optional: true,
      type: 'text',
    },
  },
};
