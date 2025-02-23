import { markdown2Html } from '#services/markdown';
import { getJob } from '#services/storage/jobStorage';
import {
  NotificationAdapterConfig,
  NotificationAdapterFieldsValue,
  SendNotificationArgs,
} from '#types/NotificationAdapter.ts';
import fetch from 'node-fetch';

export const send = ({ serviceName, newListings, notificationConfig, jobKey }: SendNotificationArgs) => {
  const adapterConfig = notificationConfig.find((adapter) => adapter.id === config.id);

  if (!adapterConfig) {
    console.error(`No adapter config found for id ${config.id}`);
    return Promise.resolve(null);
  }

  const server = adapterConfig.fields['server'];
  const topic = adapterConfig.fields['topic'];

  const isValid = (field: NotificationAdapterFieldsValue) => {
    return !field || (field.value !== null && field.value !== undefined && field.value !== '');
  };

  if (!isValid(server) || !isValid(topic)) {
    console.error(`Missing required fields in adapter config for id ${config.id}`);
    return Promise.resolve(null);
  }

  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  let message = `### *${jobName}* (${serviceName}) found **${newListings.length}** new listings:\n\n`;
  message += `| Title | Address | Size | Price |\n|:----|:----|:----|:----|\n`;
  message += newListings
    .map(
      (o) =>
        `| [${o.title}](${o.link}) | ` + [o.address, o.size?.replace(/2m/g, '$m^2$'), o.price].join(' | ') + ' |\n',
    )
    .join('');
  const body = {
    topic: topic.value,
    message: message,
    title: jobName,
    tags: [],
    priority: 3,
    click: '',
  };
  return fetch(server.value as string, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
};

export const config: NotificationAdapterConfig = {
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
