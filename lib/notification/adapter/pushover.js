/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';

export const send = async ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { token, user, device } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;

  const results = await Promise.all(
    newListings.map(async (newListing) => {
      const title = `${jobName} at ${serviceName}: ${newListing.title}`;
      const message = `Address: ${newListing.address}\nSize: ${newListing.size}\nPrice: ${newListing.price}\nLink: ${newListing.link}`;

      const form = new FormData();
      form.append('token', token);
      form.append('user', user);
      form.append('title', title);
      form.append('message', message);
      if (device) form.append('device', device);

      // Try to attach image if available
      if (newListing.image && typeof newListing.image === 'string') {
        try {
          const imgRes = await fetch(newListing.image);
          if (imgRes.ok) {
            const ab = await imgRes.arrayBuffer();
            form.append('attachment', new Blob([ab]), 'image.jpg');
          }
        } catch {
          // fail silently, just skip the image
        }
      }

      const res = await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        body: form,
      });

      return res.json();
    }),
  );

  // Collect errors
  const errors = results
    .map((r) => (r.errors && r.errors.length > 0 ? r.errors.join(', ') : null))
    .filter((e) => e !== null);

  if (errors.length > 0) {
    return Promise.reject(errors.join('; '));
  }

  return results;
};

export const config = {
  id: 'pushover',
  name: 'Pushover',
  readme: markdown2Html('lib/notification/adapter/pushover.md'),
  description: 'Fredy will send new listings to your mobile using Pushover.',
  fields: {
    token: {
      type: 'text',
      label: 'API token',
      description: "Your application's API token.",
    },
    user: {
      type: 'text',
      label: 'User key',
      description: 'Your user/group key.',
    },
    device: {
      type: 'text',
      label: 'Device name',
      description:
        'The device name to send your notification to. Messages may be addressed to multiple specific devices by joining them with a comma.',
    },
  },
};
