import { markdown2Html } from '#services/markdown';
import { getJob } from '#services/storage/jobStorage';
import {
  NotificationAdapterConfig,
  NotificationAdapterFieldsValue,
  SendNotificationArgs,
} from '#types/NotificationAdapter.ts';
import fetch from 'node-fetch';

interface PushoverResponse {
  secret: string;
  errors: string[];
  status: number;
  request: string;
}

export const send = ({ serviceName, newListings, notificationConfig, jobKey }: SendNotificationArgs) => {
  const adapterConfig = notificationConfig.find((adapter) => adapter.id === config.id);

  if (!adapterConfig) {
    console.error(`No adapter config found for id ${config.id}`);
    return Promise.resolve(null);
  }

  const token = adapterConfig.fields['token'];
  const user = adapterConfig.fields['user'];
  const device = adapterConfig.fields['device'];

  const isValid = (field: NotificationAdapterFieldsValue) => {
    return !field || (field.value !== null && field.value !== undefined && field.value !== '');
  };

  if (!isValid(token) || !isValid(user) || !isValid(device)) {
    console.error(`Missing required fields in adapter config for id ${config.id}`);
    return Promise.resolve(null);
  }

  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  const promises = newListings.map((newListing) => {
    const title = `${jobName} at ${serviceName}: ${newListing.title}`;
    const message = `Address: ${newListing.address}\nSize: ${newListing.size}\nPrice: ${newListing.price}\nLink: ${newListing.link}`;
    const body = {
      token: token.value,
      user: user.value,
      message: message,
      device: device.value,
      title: title,
    };
    return fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  });

  return Promise.all(promises)
    .then((responses) => {
      return Promise.all(responses.map((response) => response.json())) as Promise<PushoverResponse[]>;
    })
    .then((data) => {
      const error = data
        .map((item) => (item.errors != null && item.errors.length > 0 ? item.errors.join(', ') : null))
        .filter((err) => err !== null);

      if (error.length > 0) {
        return Promise.reject(error.join('; '));
      }
      return Promise.resolve();
    })
    .catch((error) => {
      return Promise.reject(error);
    });
};

export const config: NotificationAdapterConfig = {
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
