import { markdown2Html } from '#services/markdown';
import { NotificationAdapterConfig, SendNotificationArgs } from '#types/NotificationAdapter.ts';

export const send = ({ serviceName, newListings, jobKey }: SendNotificationArgs) => {
  /* eslint-disable no-console */
  return [Promise.resolve(console.info(`Found entry from service ${serviceName}, Job: ${jobKey}:`, newListings))];
  /* eslint-enable no-console */
};

export const config: NotificationAdapterConfig = {
  id: 'console',
  name: 'Console',
  description: 'This adapter sends new listings to the console. It is mostly useful for debugging.',
  readme: markdown2Html('lib/notification/adapter/console.md'),
  fields: {},
};
