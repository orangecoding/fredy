/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fetch from 'node-fetch';
import { getJob } from '../../services/storage/jobStorage.js';
import { markdown2Html } from '../../services/markdown.js';
import { normalizeImageUrl } from '../../utils.js';

/**
 * Generates an idempotent decimal color code. The input string-based color code is
 * generated using the djb2 hash algorithm.
 *
 * @param {string} str - Input string as color code base
 * @returns {number} Generated decimal color code (0 - 16777215)
 */
const generateColorFromString = (str) => {
  let hash = 5381; // initial value
  const input = String(str);

  for (let i = 0; i < input.length; i++) {
    // hash * 33 + charCode
    hash = (hash << 5) + hash + input.charCodeAt(i);
    // Ensure the hash is 32 bit
    hash |= 0;
  }

  let positiveHash = hash >>> 0;
  const maxColorValue = 16777215;
  const colorDecimal = positiveHash % maxColorValue;

  return colorDecimal;
};

/**
 * Creates an embed per listing
 * (-> see https://birdie0.github.io/discord-webhooks-guide/structure/embeds.html).
 *
 * @param {string} jobKey - Key of job (used to set embed color)
 * @param {object} listing - Object holding listing details
 * @returns {object} Discord webhook embed
 */
const buildEmbed = (jobKey, listing) => {
  const maxTitleLength = 252; // Max embed title length is 256 characters
  let title = String(listing.title ?? 'N/A');
  if (title.length > maxTitleLength) {
    title = title.substring(0, maxTitleLength) + '...';
  }

  const fields = [
    {
      name: 'Price',
      value: String(listing.price ?? 'n/a'),
      inline: true,
    },
    {
      name: 'Size',
      value: listing?.size?.replace(/2m/g, 'm²') ?? 'n/a',
      inline: true,
    },
    {
      name: 'Address',
      value: String(listing.address ?? 'n/a'),
      inline: true,
    },
  ];

  const embed = {
    title: title,
    color: generateColorFromString(jobKey),
    url: listing.link,
    fields: fields,
  };

  if (listing.image) {
    embed.image = {
      url: normalizeImageUrl(listing.image),
    };
  }

  return embed;
};

export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const adapter = notificationConfig.find((adapter) => adapter.id === config.id);
  const webhookUrl = adapter?.fields?.webhookUrl;
  if (!webhookUrl || newListings.length === 0) return Promise.resolve([]);

  const job = getJob(jobKey);
  const jobName = job?.name || jobKey;

  const embeds = newListings.map((listing) => buildEmbed(jobKey, listing));

  const maxEmbedsPerMessage = 10; // Discord only allows up to 10 embeds
  const webhookPromises = [];

  for (let i = 0; i < embeds.length; i += maxEmbedsPerMessage) {
    // Send multiple Discord messages with up to 10 embeds per message
    const embedChunk = embeds.slice(i, i + maxEmbedsPerMessage);

    const content = i === 0 ? `*${jobName}:* ${serviceName} found **${newListings.length}** new listings.` : '';
    const body = JSON.stringify({
      content: content,
      embeds: embedChunk,
    });

    const fetchPromise = fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch((error) => {
      console.error(`Error sending Discord webhook for chunk starting at ${i}:`, error);
      return Promise.reject(new Error(`Webhook failed: ${error.message}`));
    });

    webhookPromises.push(fetchPromise);
  }

  return Promise.allSettled(webhookPromises);
};

export const config = {
  id: 'discord_webhook',
  name: 'Discord Webhook',
  readme: markdown2Html('lib/notification/adapter/discord_webhook.md'),
  description: 'Fredy will send new listings to the Discord channel of your choice.',
  fields: {
    webhookUrl: {
      type: 'text',
      label: 'Webhook URL',
      description: 'The URL of the Discord webhook to send messages to.',
    },
  },
};
