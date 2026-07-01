/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';

export const send = async ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const { server } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;

  for (const newListing of newListings) {
    const title = `${jobName} at ${serviceName}: ${newListing.title}`;
    const fredyLine = baseUrl && newListing.id ? `\nOpen in Fredy: ${baseUrl}/#/listings/listing/${newListing.id}` : '';
    const message = `Address: ${newListing.address}\nSize: ${newListing.size}\nPrice: ${newListing.price}\nLink: ${newListing.link}${fredyLine}`;

    // Try to attach image if available
    if (newListing.image && typeof newListing.image === 'string') {
      try {
        const imgRes = await fetch(newListing.image);
        if (imgRes.ok) {
          const ab = await imgRes.arrayBuffer();
          const form = new FormData();
          form.append('body', message);
          form.append('title', title);
          form.append('attachment', new Blob([ab]), 'image.jpg');
          await fetch(server, {
            method: 'POST',
            body: form,
          });
          continue;
        }
      } catch {
        // fail silently, just skip the image
      }
    }

    await fetch(server, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: message,
        title: title,
      }),
    });
  }
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
