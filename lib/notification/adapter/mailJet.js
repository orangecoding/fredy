import mailjet from 'node-mailjet';
import path from 'path';
import fs from 'fs';
import Handlebars from 'handlebars';
import fetch from 'node-fetch';
import { markdown2Html } from '../../services/markdown.js';
import { getDirName, normalizeImageUrl } from '../../utils.js';

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
    console.error(`Error fetching image from ${url}:`, error.message);
    throw error;
  }
};

const mapListingsWithCid = async (serviceName, jobKey, listings) => {
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
      serviceName,
      jobKey,
      hasImage: false,
      imageCid: '',
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
        console.warn(`Skipping image for listing ${i} due to error: ${error.message}`);
      }
    }

    out.push(item);
  }

  return { listings: out, attachments };
};

export const send = async ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { apiPublicKey, apiPrivateKey, receiver, from } = notificationConfig.find(
    (adapter) => adapter.id === config.id,
  ).fields;

  const to = receiver
    .trim()
    .split(',')
    .map((r) => ({ Email: r.trim() }))
    .filter((r) => r.Email.length > 0);

  const { listings, attachments } = await mapListingsWithCid(serviceName, jobKey, newListings);

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

export const config = {
  id: 'mailjet',
  name: 'MailJet',
  description: 'MailJet is being used to send new listings via mail.',
  readme: markdown2Html('lib/notification/adapter/mailJet.md'),
  fields: {
    apiPublicKey: { type: 'text', label: 'Public Api Key' },
    apiPrivateKey: { type: 'text', label: 'Private Api Key' },
    receiver: { type: 'email', label: 'Receiver Email' },
    from: { type: 'email', label: 'Sender email' },
  },
};
