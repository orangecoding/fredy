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

  const { priority, server, topic } = adapterConfig.fields;

  const isValid = (field: NotificationAdapterFieldsValue) => {
    return !field || (field.value !== null && field.value !== undefined && field.value !== '');
  };

  if (!isValid(priority) || !isValid(server) || !isValid(topic)) {
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
    channel: topic.value,
    text: message,
  };
  return fetch(server.value as string, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
};

export const config: NotificationAdapterConfig = {
  id: 'mattermost',
  name: 'Mattermost',
  readme: markdown2Html('lib/notification/adapter/mattermost.md'),
  description: 'Fredy will send new listings to your mattermost team chat.',
  fields: {
    webhook: {
      type: 'text',
      label: 'Webhook-URL',
      description: 'The incoming webhook url',
    },
    channel: {
      type: 'text',
      label: 'Channel',
      description: 'The channel where fredy should send notifications to.',
    },
  },
};
