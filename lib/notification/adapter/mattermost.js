/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readAdapterReadme } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';
import { priceChangeTitle } from '../priceChangeMessage.js';
export const send = ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const { webhook, channel } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  // The commute column only appears when at least one listing has one, the same way the Fredy link
  // column does. An always-present column of empty cells would take width away from the rest for
  // every instance that has no addresses configured.
  const withCommute = newListings.some((o) => o.commute);
  let message = `### *${jobName}* (${serviceName}) found **${newListings.length}** new listings:\n\n`;
  message += `| Title | Address | Size | Price |${withCommute ? ' Commute |' : ''}${baseUrl ? ' Open in Fredy |' : ''}\n|:----|:----|:----|:----|${withCommute ? ':----|' : ''}${baseUrl ? ':----|\n' : '\n'}`;
  message += newListings.map((o) => {
    const fredyCell = baseUrl && o.id ? ` [Open in Fredy](${baseUrl}/#/listings/listing/${o.id}) |` : '';
    const commuteCell = withCommute ? ` ${o.commute || ''} |` : '';
    return (
      `| [${o.title}](${o.link}) | ` +
      [o.address, o.size.replace(/2m/g, '$m^2$'), o.price].join(' | ') +
      ` |${commuteCell}${fredyCell}\n`
    );
  });
  return fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: channel,
      text: message,
    }),
  });
};
/**
 * @param {{serviceName: string, priceChanges: any[], notificationConfig: any[], jobKey: string, baseUrl: string}} params
 * @returns {Promise<any>}
 */
export const sendPriceChange = ({ serviceName, priceChanges, notificationConfig, jobKey, baseUrl }) => {
  const { webhook, channel } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  let message = `### *${jobName}* (${serviceName}) reports **${priceChanges.length}** price change(s):\n\n`;
  message += `| Title | Change | Address |${baseUrl ? ' Open in Fredy |' : ''}\n|:----|:----|:----|${baseUrl ? ':----|\n' : '\n'}`;
  message += priceChanges
    .map((change) => {
      const fredyCell = baseUrl && change.id ? ` [Open in Fredy](${baseUrl}/#/listings/listing/${change.id}) |` : '';
      return `| [${change.title}](${change.link}) | ${priceChangeTitle(change)} | ${change.address} |${fredyCell}\n`;
    })
    .join('');
  return fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text: message }),
  });
};

export const config = {
  id: 'mattermost',
  name: 'Mattermost',
  readme: readAdapterReadme('mattermost.md'),
  description: 'Fredy will send new listings to your mattermost team chat.',
  fields: {
    webhook: {
      type: 'text',
      label: 'Webhook-URL',
      description: 'The incoming webhook url',
      // Never leaves the server for anyone who may not edit this channel.
      secret: true,
    },
    channel: {
      type: 'text',
      label: 'Channel',
      description: 'The channel where fredy should send notifications to.',
      // Shown as the channel's destination in the UI.
      target: true,
    },
  },
};
