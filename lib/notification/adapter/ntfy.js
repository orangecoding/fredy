import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';
import utf8 from 'utf8';
export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { priority, server, topic } = notificationConfig.find((adapter) => adapter.id === 'ntfy').fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  const url = `${server}/${topic}`;
  const promises = newListings.map((newListing) => {
    const message = utf8.encode(
      `Address: ${newListing.address} Size: ${newListing.size.replace(/2m/g, '$m^2$')} Price: ${newListing.price}`
    );
    return fetch(url, {
      method: 'POST',
      headers: {
        'X-Click': newListing.link,
        'X-Message': message,
        'X-Priority': priority,
        'X-Tags': [serviceName, jobName],
        'X-Title': utf8.encode(newListing.title),
      },
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
      description: 'The topic where fredy should send notifications to.',
    },
  },
};
