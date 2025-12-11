/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';
import { normalizeImageUrl } from '../../utils.js';

export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { priority, server, topic } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;

  const promises = newListings.map((newListing) => {
    const message = `
Address: ${newListing.address}
Size: ${newListing.size == null ? 'N/A' : newListing.size.replace(/2m/g, '$m^2$')}
Price: ${newListing.price}
Link: ${newListing.link}`;

    const sanitizeHeaderValue = (value) =>
      String(value ?? '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/[^\x20-\x7E]/g, ' ')
        .trim();

    const headers = {
      Title: sanitizeHeaderValue(newListing.title),
      Priority: sanitizeHeaderValue(priority),
      Tags: sanitizeHeaderValue(`${serviceName},${jobName}`),
      Click: sanitizeHeaderValue(newListing.link),
    };

    if (newListing.image && typeof newListing.image === 'string') {
      headers.Attach = normalizeImageUrl(newListing.image);
    }

    return fetch(`${server}/${topic}`, {
      method: 'POST',
      headers,
      body: message,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Ntfy message could not be sent. Status code: ${res.status}`);
        }
        return res.text();
      })
      .catch((error) => {
        // Ensure we reject with an Error object and prevent unhandled rejections
        throw error instanceof Error ? error : new Error(String(error));
      });
  });

  return Promise.all(promises);
};

export const config = {
  id: 'ntfy',
  name: 'ntfy',
  readme: markdown2Html('lib/notification/adapter/ntfy.md'),
  description: 'Fredy will send new listings to your ntfy.',
  fields: {
    priority: {
      type: 'number',
      label: 'Priority',
      description: 'The priority of the send notification.',
    },
    server: {
      type: 'text',
      label: 'Server-URL',
      description: 'The server url to the send the notification to.',
    },
    topic: {
      type: 'text',
      label: 'topic',
      description:
        'The topic where fredy should send notifications to. The topic is a secret, only known to you, make sure it is something not generic.',
    },
  },
};
