/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import Slack from 'slack';
import { markdown2Html } from '../../services/markdown.js';
import { normalizeImageUrl } from '../../utils.js';

const buildBlocks = (serviceName, jobKey, p) => {
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

  const img = normalizeImageUrl(p.image);
  if (img) {
    blocks.push({
      type: 'image',
      image_url: img,
      alt_text: p.title || 'listing image',
    });
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: 'Powered by Fredy' }],
  });

  return blocks;
};

export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { token, channel } = notificationConfig.find((a) => a.id === config.id).fields;

  return Promise.allSettled(
    newListings.map((p) =>
      Slack.chat.postMessage({
        token,
        channel,
        text: `${serviceName} ${jobKey}: ${p.title}`,
        blocks: buildBlocks(serviceName, jobKey, p),
        unfurl_links: false,
        unfurl_media: false,
      }),
    ),
  );
};

export const config = {
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
      type: 'channel',
      label: 'Channel',
      description: 'The channel where fredy should send notifications to.',
    },
  },
};
