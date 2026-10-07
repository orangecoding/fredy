/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fetch from 'node-fetch';
import { readAdapterReadme } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import { normalizeImageUrl } from '../../utils.js';
import { priceChangeBody, priceChangeTitle } from '../priceChangeMessage.js';

/**
 * Used when the channel leaves the priority empty.
 *
 * Gotify falls back to the application's default priority when a message carries none, and that
 * default is 0 unless someone changed it - which the Android app treats as "do not notify at all".
 * A channel that silently delivers nothing is worse than one that is a little loud, so Fredy sends
 * the middle of the "notify with sound" band instead.
 */
export const DEFAULT_PRIORITY = 5;

/**
 * Resolve the endpoint messages are posted to.
 *
 * Gotify is often served under a path behind a reverse proxy (`https://example.com/gotify`), so
 * the path is kept and only trailing slashes are dropped before `/message` is appended.
 *
 * @param {string} server - The Gotify base URL as entered by the user.
 * @returns {string} The full `/message` endpoint.
 */
export const buildMessageUrl = (server) =>
  `${String(server ?? '')
    .trim()
    .replace(/\/+$/, '')}/message`;

/**
 * Turn the configured priority into the integer Gotify expects.
 *
 * Number fields reach the adapter as strings or numbers depending on where the channel was saved,
 * and an empty one must not become `Number('') === 0`, which would mute the notification.
 *
 * @param {string|number|null|undefined} priority
 * @returns {number} The priority to send.
 */
export const resolvePriority = (priority) => {
  if (priority == null || String(priority).trim().length === 0) return DEFAULT_PRIORITY;
  const parsed = Number(priority);
  return Number.isFinite(parsed) ? Math.round(parsed) : DEFAULT_PRIORITY;
};

/**
 * Backslash-escape the characters that would otherwise turn listing text into Markdown markup.
 *
 * CommonMark allows a backslash in front of any ASCII punctuation, so escaping more than strictly
 * needed is harmless; the set here covers emphasis, links, images, headings, code and HTML.
 *
 * @param {any} value
 * @returns {string}
 */
export const escapeMarkdown = (value) => String(value ?? '').replace(/[\\`*_[\]<>#~|!]/g, '\\$&');

/**
 * Markdown body for a new listing.
 *
 * Markdown rather than plain text because Gotify's web UI does not turn bare URLs into links, so a
 * plain body would leave the listing one copy-and-paste away. Lines end in two spaces, a Markdown
 * hard break, so the details stay on separate lines without a blank line between each.
 *
 * @param {Object} listing
 * @param {string} [baseUrl] Fredy's own base URL, when configured.
 * @returns {string}
 */
export const buildListingMessage = (listing, baseUrl) => {
  const details = [
    `**Address:** ${escapeMarkdown(listing.address ?? 'N/A')}`,
    `**Size:** ${escapeMarkdown(listing.size ?? 'N/A')}`,
    `**Price:** ${escapeMarkdown(listing.price ?? 'N/A')}`,
    listing.commute ? `**Commute:** ${escapeMarkdown(listing.commute)}` : null,
  ].filter(Boolean);

  const links = [
    listing.link ? `[Open listing](<${listing.link}>)` : null,
    baseUrl && listing.id ? `[Open in Fredy](<${baseUrl}/#/listings/listing/${listing.id}>)` : null,
  ].filter(Boolean);

  const imageUrl = normalizeImageUrl(listing.image);

  return [details.join('  \n'), links.join(' · '), imageUrl ? `![](<${imageUrl}>)` : null]
    .filter((block) => block != null && block.length > 0)
    .join('\n\n');
};

/**
 * Post one message to Gotify.
 *
 * The app token travels in the `X-Gotify-Key` header rather than the `?token=` query parameter so
 * it does not end up in proxy access logs.
 *
 * @param {{server: string, token: string, payload: Object}} params
 * @returns {Promise<Object>} The message Gotify stored.
 * @throws {Error} When Gotify answers with a non-2xx status.
 */
const postMessage = async ({ server, token, payload }) => {
  const res = await fetch(buildMessageUrl(server), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Gotify-Key': String(token ?? '').trim(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let reason = '';
    try {
      const body = await res.json();
      if (body?.errorDescription) reason = ` (${body.errorDescription})`;
    } catch {
      // Not every proxy in front of Gotify answers with JSON; the status code is enough then.
    }
    throw new Error(`Gotify message could not be sent. Status code: ${res.status}${reason}`);
  }

  return res.json();
};

/**
 * Read this adapter's fields out of the job's notification configuration.
 *
 * @param {Array<{id: string, fields: Object}>} notificationConfig
 * @returns {{server: string, token: string, priority: number}}
 */
const readFields = (notificationConfig) => {
  const { server, token, priority } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  return { server, token, priority: resolvePriority(priority) };
};

/**
 * Send one Gotify message per new listing.
 *
 * @param {{serviceName: string, newListings: Object[], notificationConfig: any[], jobKey: string, baseUrl?: string}} params
 * @returns {Promise<Object[]>}
 */
export const send = ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const { server, token, priority } = readFields(notificationConfig);
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;

  return Promise.all(
    newListings.map((listing) => {
      const notification = {};
      if (listing.link) notification.click = { url: listing.link };
      const bigImageUrl = normalizeImageUrl(listing.image);
      if (bigImageUrl) notification.bigImageUrl = bigImageUrl;

      return postMessage({
        server,
        token,
        payload: {
          title: `${jobName} at ${serviceName}: ${listing.title}`,
          message: buildListingMessage(listing, baseUrl),
          priority,
          extras: {
            'client::display': { contentType: 'text/markdown' },
            'client::notification': notification,
          },
        },
      });
    }),
  );
};

/**
 * Send one Gotify message per price change.
 *
 * The body is the shared plain-text one from `priceChangeMessage.js`, so a user with several
 * channels reads the same words everywhere.
 *
 * @param {{serviceName: string, priceChanges: any[], notificationConfig: any[], jobKey: string, baseUrl?: string}} params
 * @returns {Promise<Object[]>}
 */
export const sendPriceChange = ({ serviceName, priceChanges, notificationConfig, jobKey, baseUrl }) => {
  const { server, token, priority } = readFields(notificationConfig);
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;

  return Promise.all(
    priceChanges.map((change) =>
      postMessage({
        server,
        token,
        payload: {
          title: `${jobName} at ${serviceName}: ${priceChangeTitle(change)}`,
          message: priceChangeBody(change, baseUrl),
          priority,
          extras: {
            'client::display': { contentType: 'text/plain' },
            'client::notification': change.link ? { click: { url: change.link } } : {},
          },
        },
      }),
    ),
  );
};

export const config = {
  id: 'gotify',
  name: 'Gotify',
  readme: readAdapterReadme('gotify.md'),
  description: 'Fredy will send new listings to your self-hosted Gotify server.',
  fields: {
    server: {
      type: 'text',
      label: 'Server URL',
      description: 'The URL of your Gotify server, e.g. https://gotify.example.com',
      // Shown as the channel's destination in the UI.
      target: true,
    },
    token: {
      type: 'text',
      label: 'App token',
      description: 'The token of the Gotify application Fredy should post as (Apps > Create application).',
      // Never leaves the server for anyone who may not edit this channel.
      secret: true,
    },
    priority: {
      type: 'number',
      optional: true,
      label: 'Priority (optional)',
      description: `The message priority, usually 0-10. On Android, 0 shows no notification, 1-3 is silent, 4-7 plays a sound and 8-10 also vibrates. Defaults to ${DEFAULT_PRIORITY}.`,
    },
  },
};
