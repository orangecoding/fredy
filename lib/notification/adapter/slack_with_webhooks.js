/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fetch from 'node-fetch';
import { readAdapterReadme } from '../../services/markdown.js';
import { normalizeImageUrl } from '../../utils.js';
import { toPriceChangeListing, priceChangeTitle } from '../priceChangeMessage.js';

const buildBlocks = (serviceName, jobKey, p, baseUrl) => {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `New Listing from ${serviceName} (${jobKey})`, emoji: false },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*<${p.link}|${p.title}>*` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Price*\n${p.price ?? 'n/a'}` },
        { type: 'mrkdwn', text: `*Size*\n${p.size ?? 'n/a'}` },
        { type: 'mrkdwn', text: `*Address*\n${p.address ?? 'n/a'}` },
      ],
    },
  ];

  // Its own section rather than a fourth field: the fields above are two per row, and a commute
  // line for several addresses is far too long for half a row.
  if (p.commute) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Commute*\n${p.commute}` },
    });
  }

  const img = normalizeImageUrl(p.image);
  if (img) {
    blocks.push({
      type: 'image',
      image_url: img,
      alt_text: p.title || 'listing image',
    });
  }

  if (baseUrl && p.id) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `<${baseUrl}/#/listings/listing/${p.id}|Open in Fredy>` },
    });
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: 'Powered by Fredy' }],
  });

  return blocks;
};

const postJson = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

export const send = ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const adapter = notificationConfig.find((a) => a.id === config.id);
  const webhookUrl = adapter?.fields?.webhookUrl;
  if (!webhookUrl) return Promise.resolve([]);

  const promises = newListings.map((p) => {
    const body = JSON.stringify({
      text: `${serviceName} ${jobKey}: ${p.title}`,
      blocks: buildBlocks(serviceName, jobKey, p, baseUrl),
      unfurl_links: false,
      unfurl_media: false,
    });
    return postJson(webhookUrl, body);
  });

  return Promise.allSettled(promises);
};

/**
 * @param {{serviceName: string, priceChanges: any[], notificationConfig: any[], jobKey: string, baseUrl: string}} params
 * @returns {Promise<any>}
 */
export const sendPriceChange = ({ serviceName, priceChanges, notificationConfig, jobKey, baseUrl }) => {
  const adapter = notificationConfig.find((a) => a.id === config.id);
  const webhookUrl = adapter?.fields?.webhookUrl;
  if (!webhookUrl) return Promise.resolve([]);

  const promises = priceChanges.map((change) =>
    postJson(
      webhookUrl,
      JSON.stringify({
        text: `${serviceName} ${jobKey}: ${priceChangeTitle(change)}`,
        blocks: buildBlocks(serviceName, jobKey, toPriceChangeListing(change), baseUrl),
        unfurl_links: false,
        unfurl_media: false,
      }),
    ),
  );

  return Promise.allSettled(promises);
};

export const config = {
  id: 'slack_with_webhooks',
  name: 'Slack with Webhooks',
  readme: readAdapterReadme('slack_with_webhooks.md'),
  description: 'Fredy will send new listings to the slack channel of your choice..',
  fields: {
    webhookUrl: {
      type: 'text',
      label: 'Webhook-Url',
      description: 'The Url of the Webhook to send messages to.',
    },
  },
};
