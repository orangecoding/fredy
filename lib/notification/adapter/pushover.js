import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';

export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { token, user, device } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  const promises = newListings.map((newListing) => {
    const title = `${jobName} at ${serviceName}: ${newListing.title}`;
    const message = `Address: ${newListing.address}\nSize: ${newListing.size}\nPrice: ${newListing.price}\nLink: ${newListing.link}`;
    return fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token,
        user: user,
        message: message,
        device: device,
        title: title,
      }),
    });
  });

  return Promise.all(promises)
    .then((responses) => {
      // Convert all responses to JSON
      return Promise.all(responses.map((response) => response.json()));
    })
    .then((data) => {
      // Check for errors in the data
      const error = data
        .map((item) => (item.errors != null && item.errors.length > 0 ? item.errors.join(', ') : null))
        .filter((err) => err !== null);

      if (error.length > 0) {
        // Reject with the combined error messages
        return Promise.reject(error.join('; '));
      }

      return data;
    })
    .then(() => {
      return Promise.resolve();
    })
    .catch((error) => {
      return Promise.reject(error);
    });
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
