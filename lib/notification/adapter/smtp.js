/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import Handlebars from 'handlebars';
import { markdown2Html } from '../../services/markdown.js';
import { getDirName, normalizeImageUrl } from '../../utils.js';

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
      image,
      hasImage: Boolean(image),
      fredyUrl: baseUrl && l.id ? `${baseUrl}/listings/listing/${l.id}` : null,
      serviceName,
      jobKey,
    };
  });

export const send = async ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const { host, port, secure, username, password, receiver, from } = notificationConfig.find(
    (adapter) => adapter.id === config.id,
  ).fields;

  const to = receiver
    .trim()
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: secure === 'true',
    auth: {
      user: username,
      pass: password,
    },
  });

  const listings = mapListings(serviceName, jobKey, newListings, baseUrl);

  const html = emailTemplate({
    serviceName: `Job: (${jobKey}) | Service: ${serviceName}`,
    numberOfListings: listings.length,
    listings,
  });

  return transporter.sendMail({
    from,
    to: to.join(','),
    subject: `Fredy found ${listings.length} new listing(s) for ${serviceName}`,
    html,
  });
};

export const config = {
  id: 'smtp',
  name: 'SMTP',
  description: 'Send notifications via any SMTP server using Nodemailer.',
  readme: markdown2Html('lib/notification/adapter/smtp.md'),
  fields: {
    host: {
      type: 'text',
      label: 'SMTP Host',
      description: 'The hostname of the SMTP server (e.g., smtp.gmail.com).',
    },
    port: {
      type: 'text',
      label: 'SMTP Port',
      description: 'The port of the SMTP server (e.g., 587 for STARTTLS, 465 for SSL).',
    },
    secure: {
      type: 'text',
      label: 'Secure (SSL/TLS)',
      description: 'Set to "true" for port 465 (SSL). Leave empty or "false" for STARTTLS on port 587.',
    },
    username: {
      type: 'text',
      label: 'Username',
      description: 'The username for SMTP authentication.',
    },
    password: {
      type: 'text',
      label: 'Password',
      description: 'The password (or app password) for SMTP authentication.',
    },
    receiver: {
      type: 'text',
      label: 'Receiver Email(s)',
      description: 'Comma-separated email addresses Fredy will send notifications to.',
    },
    from: {
      type: 'email',
      label: 'Sender Email',
      description: 'The email address Fredy sends from.',
    },
  },
};
