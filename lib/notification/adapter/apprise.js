/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readAdapterReadme } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';
import { priceChangeBody, priceChangeTitle } from '../priceChangeMessage.js';

export const send = ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const { server } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  const promises = newListings.map((newListing) => {
    const title = `${jobName} at ${serviceName}: ${newListing.title}`;
    const fredyLine = baseUrl && newListing.id ? `\nOpen in Fredy: ${baseUrl}/#/listings/listing/${newListing.id}` : '';
    const commuteLine = newListing.commute ? `\nCommute: ${newListing.commute}` : '';
    const message = `Address: ${newListing.address}\nSize: ${newListing.size}\nPrice: ${newListing.price}${commuteLine}\nLink: ${newListing.link}${fredyLine}`;
    return fetch(server, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: message,
        title: title,
      }),
    });
  });
  return Promise.all(promises);
};
/**
 * @param {{serviceName: string, priceChanges: any[], notificationConfig: any[], jobKey: string, baseUrl: string}} params
 * @returns {Promise<any>}
 */
export const sendPriceChange = ({ serviceName, priceChanges, notificationConfig, jobKey, baseUrl }) => {
  const { server } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  const promises = priceChanges.map((change) =>
    fetch(server, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `${jobName} at ${serviceName}: ${priceChangeTitle(change)}`,
        body: priceChangeBody(change, baseUrl),
      }),
    }),
  );
  return Promise.all(promises);
};

export const config = {
  id: 'apprise',
  name: 'Apprise',
  readme: readAdapterReadme('apprise.md'),
  description: 'Fredy will send new listings to your Apprise instance.',
  fields: {
    server: {
      type: 'text',
      label: 'Server',
      description: 'The server URL to send the notification to.',
    },
  },
};
