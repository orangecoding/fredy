import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';

export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { server } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  const promises = newListings.map((newListing) => {
    const title = `${jobName} at ${serviceName}: ${newListing.title}`;
    const message = `Address: ${newListing.address}\nSize: ${newListing.size}\nPrice: ${newListing.price}\nLink: ${newListing.link}`;
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
