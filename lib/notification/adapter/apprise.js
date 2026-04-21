/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';

export const send = ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const { server } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  const promises = newListings.map((newListing) => {
    const title = `${jobName} at ${serviceName}: ${newListing.title}`;
    const fredyLine = baseUrl && newListing.id ? `\nOpen in Fredy: ${baseUrl}/listings/listing/${newListing.id}` : '';
    const message = `Address: ${newListing.address}\nSize: ${newListing.size}\nPrice: ${newListing.price}\nLink: ${newListing.link}${fredyLine}`;
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
export const config = {
  id: 'apprise',
  name: 'Apprise',
  readme: markdown2Html('lib/notification/adapter/apprise.md'),
  description: 'Fredy will send new listings to your Apprise instance.',
  fields: {
    server: {
      type: 'text',
      label: 'Server',
      description: 'The server URL to send the notification to.',
    },
  },
};
