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

  return fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
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
      type: 'text',
      label: 'Endpoint URL',
      description: "'Your application's endpoint URL.",
    },
    authToken: {
      type: 'text',
      label: 'Auth token',
      description: "Your application's auth token.",
    },
  },
};
