import Slack from 'slack';
import { markdown2Html } from '#services/markdown';
import {
  NotificationAdapterConfig,
  NotificationAdapterFieldsValue,
  SendNotificationArgs,
} from '#types/NotificationAdapter.ts';

const msg = Slack.chat.postMessage;
export const send = ({ serviceName, newListings, notificationConfig, jobKey }: SendNotificationArgs) => {
  const adapterConfig = notificationConfig.find((adapter) => adapter.id === config.id);

  if (!adapterConfig) {
    console.error(`No adapter config found for id ${config.id}`);
    return Promise.resolve(null);
  }

  const token = adapterConfig.fields['token'];
  const channel = adapterConfig.fields['channel'];

  const isValid = (field: NotificationAdapterFieldsValue) => {
    return !field || (field.value !== null && field.value !== undefined && field.value !== '');
  };

  if (!isValid(token) || !isValid(channel)) {
    console.error(`Missing required fields in adapter config for id ${config.id}`);
    return Promise.resolve(null);
  }

  return Promise.all(
    newListings.map((payload) =>
      msg({
        token: token.value,
        channel: channel.value,
        text: `*(${serviceName} - ${jobKey})* - ${payload.title}`,
        attachments: [
          {
            fallback: payload.title,
            color: '#36a64f',
            title: 'Link to Exposé',
            title_link: payload.link,
            fields: [
              {
                title: 'Price',
                value: payload.price,
                short: false,
              },
              {
                title: 'Size',
                value: payload.size,
                short: false,
              },
              {
                title: 'Address',
                value: payload.address,
                short: false,
              },
            ],
            footer: 'Powered by Fredy',
            ts: new Date().getTime() / 1000,
          },
        ],
      }),
    ),
  );
};

export const config: NotificationAdapterConfig = {
  id: 'slack',
  name: 'Slack',
  readme: markdown2Html('lib/notification/adapter/slack.md'),
  description: 'Fredy will send new listings to the slack channel of your choice..',
  fields: {
    token: {
      type: 'text',
      label: 'Token',
      description: 'The token needed to send notifications to slack.',
    },
    channel: {
      type: 'text',
      label: 'Channel',
      description: 'The channel where fredy should send notifications to.',
    },
  },
};
