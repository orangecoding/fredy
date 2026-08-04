/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import sgMail from '@sendgrid/mail';
import { readAdapterReadme } from '../../services/markdown.js';
import { normalizeImageUrl } from '../../utils.js';
import { toPriceChangeListing } from '../priceChangeMessage.js';

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
      // optional plain text snippet
      snippet: [l.address, l.price, l.size, l.commute].filter(Boolean).join(' | '),
      fredyUrl: baseUrl && l.id ? `${baseUrl}/#/listings/listing/${l.id}` : null,
      serviceName,
      jobKey,
    };
  });

export const send = ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const { apiKey, receiver, from, templateId } = notificationConfig.find((adapter) => adapter.id === config.id).fields;

  sgMail.setApiKey(apiKey);

  const to = receiver
    .trim()
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const listings = mapListings(serviceName, jobKey, newListings, baseUrl);

  const msg = {
    templateId,
    to,
    from,
    subject: `Job ${jobKey} | Service ${serviceName} found ${newListings.length} new listing(s)`,
    dynamic_template_data: {
      serviceName: `Job: (${jobKey}) | Service: ${serviceName}`,
      numberOfListings: newListings.length,
      listings,
    },
  };

  return sgMail.send(msg);
};

/**
 * @param {{serviceName: string, priceChanges: any[], notificationConfig: any[], jobKey: string, baseUrl: string}} params
 * @returns {Promise<any>}
 */
export const sendPriceChange = ({ serviceName, priceChanges, notificationConfig, jobKey, baseUrl }) => {
  const { apiKey, receiver, from, templateId } = notificationConfig.find((adapter) => adapter.id === config.id).fields;

  sgMail.setApiKey(apiKey);

  const to = receiver
    .trim()
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const changes = mapListings(serviceName, jobKey, priceChanges.map(toPriceChangeListing), baseUrl);

  return sgMail.send({
    templateId,
    to,
    from,
    subject: `Fredy found ${changes.length} price change(s) for ${serviceName}`,
    dynamic_template_data: {
      serviceName: `Job: (${jobKey}) | Service: ${serviceName}`,
      numberOfListings: changes.length,
      listings: changes,
    },
  });
};

export const config = {
  id: 'sendgrid',
  name: 'SendGrid',
  description: 'SendGrid is being used to send new listings via mail.',
  readme: readAdapterReadme('sendGrid.md'),
  fields: {
    apiKey: {
      type: 'text',
      label: 'Api Key',
      description: 'The api key needed to access this service.',
    },
    receiver: {
      type: 'email',
      label: 'Receiver Email',
      description: 'The email address (single one) which Fredy is using to send notifications to.',
    },
    from: {
      type: 'email',
      label: 'Sender Email',
      description:
        'The email address from which Fredy send email. Beware, this email address needs to be verified by Sendgrid.',
    },
    templateId: {
      type: 'text',
      label: 'Template Id',
      description: 'Sendgrid supports templates which Fredy is using to send out emails that looks awesome ;)',
    },
  },
};
