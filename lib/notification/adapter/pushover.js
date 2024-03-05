import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';

export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { token, user } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  const promises = newListings.map((newListing) => {
    const message = `Address: ${newListing.address}\nSize: ${newListing.size}\nPrice: ${newListing.price}`;
    return fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token,
        user: user,
        message: message,
        title: newListing.title,
        url: newListing.link,
      }),
    });
  });

  return Promise.all(promises);
};

export const config = {
  id: 'pushover',
  name: 'Pushover',
  readme: markdown2Html('lib/notification/adapter/pushover.md'),
  description: 'Fredy will send new listings to your mobile, using Pushover.',
  fields: {
    token: {
      type: 'text',
      label: 'API token',
      description: 'Your application\'s API token.',
    },
    user: {
      type: 'text',
      label: 'User key',
      description: 'Your user/group key.',
    },
  },
};