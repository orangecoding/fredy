/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';
import { normalizeImageUrl } from '../../utils.js';

/**
 * Builds the value for the `Authorization` header used to authenticate against
 * a protected ntfy server. An access token takes precedence over basic auth.
 *
 * @param {{username?: string, password?: string, accessToken?: string}} credentials
 * @returns {string|null} the Authorization header value, or null when no credentials are configured
 */
export const buildAuthorizationHeader = ({ username, password, accessToken } = {}) => {
  const token = typeof accessToken === 'string' ? accessToken.trim() : '';
  if (token.length > 0) {
    return `Bearer ${token}`;
  }

  const user = typeof username === 'string' ? username.trim() : '';
  if (user.length > 0) {
    const encoded = Buffer.from(`${user}:${password ?? ''}`).toString('base64');
    return `Basic ${encoded}`;
  }

  return null;
};

export const send = ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const { priority, server, topic, username, password, accessToken } = notificationConfig.find(
    (adapter) => adapter.id === config.id,
  ).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;

  // ntfy supports two auth schemes (https://docs.ntfy.sh/publish/#authentication):
  // - Bearer access token (preferred), used when an access token is provided
  // - HTTP Basic with username/password
  const authorization = buildAuthorizationHeader({ username, password, accessToken });

  const promises = newListings.map((newListing) => {
    const fredyLine = baseUrl && newListing.id ? `\nOpen in Fredy: ${baseUrl}/#/listings/listing/${newListing.id}` : '';
    const message = `
Address: ${newListing.address}
Size: ${newListing.size == null ? 'N/A' : newListing.size.replace(/2m/g, '$m^2$')}
Price: ${newListing.price}
Link: ${newListing.link}${fredyLine}`;

    const sanitizeHeaderValue = (value) =>
      String(value ?? '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/[^\x20-\x7E]/g, ' ')
        .trim();

    const headers = {
      Title: sanitizeHeaderValue(newListing.title),
      Priority: sanitizeHeaderValue(priority),
      Tags: sanitizeHeaderValue(`${serviceName},${jobName}`),
      Click: sanitizeHeaderValue(newListing.link),
    };

    if (newListing.image && typeof newListing.image === 'string') {
      headers.Attach = normalizeImageUrl(newListing.image);
    }

    if (authorization != null) {
      headers.Authorization = authorization;
    }

    return fetch(`${server}/${topic}`, {
      method: 'POST',
      headers,
      body: message,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Ntfy message could not be sent. Status code: ${res.status}`);
        }
        return res.text();
      })
      .catch((error) => {
        // Ensure we reject with an Error object and prevent unhandled rejections
        throw error instanceof Error ? error : new Error(String(error));
      });
  });

  return Promise.all(promises);
};

export const config = {
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
    accessToken: {
      type: 'text',
      optional: true,
      label: 'Access Token (optional)',
      description:
        'Optional: ntfy access token for servers that require authentication. Takes precedence over username/password. See https://docs.ntfy.sh/publish/#authentication',
    },
    username: {
      type: 'text',
      optional: true,
      label: 'Username (optional)',
      description: 'Optional: username for HTTP Basic auth. Only used when no access token is provided.',
    },
    password: {
      type: 'text',
      optional: true,
      label: 'Password (optional)',
      description: 'Optional: password for HTTP Basic auth, used together with the username.',
    },
  },
};
