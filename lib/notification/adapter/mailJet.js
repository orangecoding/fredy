/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import mailjet from 'node-mailjet';
import path from 'path';
import fs from 'fs';
import Handlebars from 'handlebars';
import fetch from 'node-fetch';
import { readAdapterReadme } from '../../services/markdown.js';
import { getDirName, normalizeImageUrl } from '../../utils.js';
import logger from '../../services/logger.js';
import { toPriceChangeListing } from '../priceChangeMessage.js';

const __dirname = getDirName();
const template = fs.readFileSync(path.resolve(__dirname + '/notification/emailTemplate/template.hbs'), 'utf8');
const emailTemplate = Handlebars.compile(template);

const guessMime = (url) => {
  const lower = url.split('?')[0].toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
};

const toBase64 = async (url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed with status ${res.status} for URL: ${url}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab).toString('base64');
  } catch (error) {
    logger.error(`Error fetching image from ${url}:`, error.message);
    throw error;
  }
};

const mapListingsWithCid = async (serviceName, jobKey, listings, baseUrl) => {
  const out = [];
  const attachments = [];

  for (let i = 0; i < listings.length; i++) {
    const l = listings[i] || {};
    const imgUrl = normalizeImageUrl(l.image);

    const item = {
      title: l.title || '',
      link: l.link || '',
      address: l.address || '',
      size: l.size || '',
      price: l.price || '',
      commute: l.commute || '',
      serviceName,
      jobKey,
      hasImage: false,
      imageCid: '',
      fredyUrl: baseUrl && l.id ? `${baseUrl}/#/listings/listing/${l.id}` : null,
    };

    if (imgUrl) {
      try {
        const base64 = await toBase64(imgUrl);
        const cid = `listing-${i}`;
        attachments.push({
          ContentType: guessMime(imgUrl),
          Filename: `listing-${i}.${imgUrl.split('.').pop().split('?')[0] || 'jpg'}`,
          Base64Content: base64,
          ContentID: cid,
        });
        item.hasImage = true;
        item.imageCid = cid;
      } catch (error) {
        logger.warn(`Skipping image for listing ${i} due to error: ${error.message}`);
      }
    }

    out.push(item);
  }

  return { listings: out, attachments };
};

export const send = async ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const { apiPublicKey, apiPrivateKey, receiver, from } = notificationConfig.find(
    (adapter) => adapter.id === config.id,
  ).fields;

  const to = receiver
    .trim()
    .split(',')
    .map((r) => ({ Email: r.trim() }))
    .filter((r) => r.Email.length > 0);

  const { listings, attachments } = await mapListingsWithCid(serviceName, jobKey, newListings, baseUrl);

  const html = emailTemplate({
    serviceName: `Job: (${jobKey}) | Service: ${serviceName}`,
    numberOfListings: listings.length,
    listings,
  });

  return mailjet
    .apiConnect(apiPublicKey, apiPrivateKey)
    .post('send', { version: 'v3.1' })
    .request({
      Messages: [
        {
          From: { Email: from, Name: 'Fredy' },
          To: to,
          Subject: `Fredy found ${listings.length} new listing(s) for ${serviceName}`,
          HTMLPart: html,
          InlinedAttachments: attachments,
        },
      ],
    });
};

/**
 * @param {{serviceName: string, priceChanges: any[], notificationConfig: any[], jobKey: string, baseUrl: string}} params
 * @returns {Promise<any>}
 */
export const sendPriceChange = async ({ serviceName, priceChanges, notificationConfig, jobKey, baseUrl }) => {
  const { apiPublicKey, apiPrivateKey, receiver, from } = notificationConfig.find(
    (adapter) => adapter.id === config.id,
  ).fields;

  const to = receiver
    .trim()
    .split(',')
    .map((r) => ({ Email: r.trim() }))
    .filter((r) => r.Email.length > 0);

  const { listings: changes, attachments } = await mapListingsWithCid(
    serviceName,
    jobKey,
    priceChanges.map(toPriceChangeListing),
    baseUrl,
  );

  const html = emailTemplate({
    serviceName: `Job: (${jobKey}) | Service: ${serviceName}`,
    numberOfListings: changes.length,
    listings: changes,
  });

  return mailjet
    .apiConnect(apiPublicKey, apiPrivateKey)
    .post('send', { version: 'v3.1' })
    .request({
      Messages: [
        {
          From: { Email: from, Name: 'Fredy' },
          To: to,
          Subject: `Fredy found ${changes.length} price change(s) for ${serviceName}`,
          HTMLPart: html,
          InlinedAttachments: attachments,
        },
      ],
    });
};

export const config = {
  id: 'mailjet',
  name: 'MailJet',
  description: 'MailJet is being used to send new listings via mail.',
  readme: readAdapterReadme('mailJet.md'),
  fields: {
    apiPublicKey: {
      type: 'text',
      label: 'Public Api Key',
      description: 'The public api key needed to access this service.',
      // Never leaves the server for anyone who may not edit this channel.
      secret: true,
    },
    apiPrivateKey: {
      type: 'text',
      label: 'Private Api Key',
      description: 'The private api key needed to access this service.',
      secret: true,
    },
    receiver: {
      type: 'email',
      label: 'Receiver Email',
      description: 'The email address (single one) which Fredy is using to send notifications to.',
      // Shown as the channel's destination in the UI.
      target: true,
    },
    from: {
      type: 'email',
      label: 'Sender email',
      description:
        'The email address from which Fredy send email. Beware, this email address needs to be verified by Sendgrid.',
    },
  },
};
