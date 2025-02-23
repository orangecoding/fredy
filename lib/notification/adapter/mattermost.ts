import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';
export const send = ({
  serviceName,
  newListings,
  notificationConfig,
  jobKey
}: any) => {
  const { webhook, channel } = notificationConfig.find((adapter: any) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  let message = `### *${jobName}* (${serviceName}) found **${newListings.length}** new listings:\n\n`;
  message += `| Title | Address | Size | Price |\n|:----|:----|:----|:----|\n`;
  message += newListings.map(
    (o: any) => `| [${o.title}](${o.link}) | ` + [o.address, o.size.replace(/2m/g, '$m^2$'), o.price].join(' | ') + ' |\n',
  );
  return fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      channel: channel,
      // @ts-expect-error TS(2322): Type 'string' is not assignable to type '() => Pro... Remove this comment to see the full error message
      text: message,
    },
  });
};
export const config = {
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
