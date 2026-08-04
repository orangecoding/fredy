/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Resend } from 'resend';
import path from 'path';
import fs from 'fs';
import Handlebars from 'handlebars';
import { readAdapterReadme } from '../../services/markdown.js';
import { getDirName, normalizeImageUrl } from '../../utils.js';
import { toPriceChangeListing } from '../priceChangeMessage.js';

const __dirname = getDirName();
const template = fs.readFileSync(path.resolve(__dirname + '/notification/emailTemplate/template.hbs'), 'utf8');
const emailTemplate = Handlebars.compile(template);

const mapListings = (serviceName, jobKey, listings, baseUrl) =>
  listings.map((l) => {
    const image = normalizeImageUrl(l.image);
    return {
      title: l.title || '',
      link: l.link || '',
      address: l.address || '',
      size: l.size || '',
      price: l.price || '',
      commute: l.commute || '',
      image,
      hasImage: Boolean(image),
      fredyUrl: baseUrl && l.id ? `${baseUrl}/#/listings/listing/${l.id}` : null,
      serviceName,
      jobKey,
    };
  });

export const send = async ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const { apiKey, receiver, from } = notificationConfig.find((adapter) => adapter.id === config.id).fields;

  const to = receiver
    .trim()
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const resend = new Resend(apiKey);

  const listings = mapListings(serviceName, jobKey, newListings, baseUrl);

  const html = emailTemplate({
    serviceName: `Job: (${jobKey}) | Service: ${serviceName}`,
    numberOfListings: listings.length,
    listings,
  });

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Fredy found ${listings.length} new listing(s) for ${serviceName}`,
    html,
  });

  if (!error) {
    return Promise.resolve();
  } else {
    return Promise.reject(error.message);
  }
};

/**
 * @param {{serviceName: string, priceChanges: any[], notificationConfig: any[], jobKey: string, baseUrl: string}} params
 * @returns {Promise<any>}
 */
export const sendPriceChange = async ({ serviceName, priceChanges, notificationConfig, jobKey, baseUrl }) => {
  const { apiKey, receiver, from } = notificationConfig.find((adapter) => adapter.id === config.id).fields;

  const to = receiver
    .trim()
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const resend = new Resend(apiKey);
  const changes = mapListings(serviceName, jobKey, priceChanges.map(toPriceChangeListing), baseUrl);

  const html = emailTemplate({
    serviceName: `Job: (${jobKey}) | Service: ${serviceName}`,
    numberOfListings: changes.length,
    listings: changes,
  });

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Fredy found ${changes.length} price change(s) for ${serviceName}`,
    html,
  });

  return error ? Promise.reject(error.message) : Promise.resolve();
};

export const config = {
  id: 'resend',
  name: 'Resend',
  description: 'Resend is being used to send new listings via mail.',
  readme: readAdapterReadme('resend.md'),
  fields: {
    apiKey: {
      type: 'text',
      label: 'Api Key',
      description: 'The Resend API key used to send emails.',
    },
    receiver: {
      type: 'email',
      label: 'Receiver Email',
      description: 'Comma-separated email addresses Fredy will send notifications to.',
    },
    from: {
      type: 'email',
      label: 'Sender Email',
      description: 'The verified email address or domain you send from in Resend.',
    },
  },
};
