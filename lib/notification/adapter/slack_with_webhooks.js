import fetch from 'node-fetch';
import { markdown2Html } from '../../services/markdown.js';

const RE_GT = />/g;
const RE_WEBP = /\/format\/webp/gi;
const RE_EXT = /\.(jpe?g|png|gif)(\?.*)?$/i;
const HTTPS_PREFIX = 'https://';

const normalizeImageUrl = (url) => {
  if (typeof url !== 'string' || url.length === 0) return null;

  let u = url.trim().replace(RE_GT, '');

  // prefer jpg over webp for Slack previews
  if (RE_WEBP.test(u)) u = u.replace(RE_WEBP, '/format/jpg');

  // basic sanity checks
  if (!u.startsWith(HTTPS_PREFIX)) return null;
  if (!RE_EXT.test(u)) {
    // try to coerce common .jpg endings that have extra path parts
    const jpgIdx = u.toLowerCase().lastIndexOf('.jpg');
    if (jpgIdx > -1) u = u.slice(0, jpgIdx + 4);
  }

  return u;
};

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

const postJson = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const adapter = notificationConfig.find((a) => a.id === config.id);
  const webhookUrl = adapter?.fields?.webhookUrl;
  if (!webhookUrl) return Promise.resolve([]);

  const promises = newListings.map((p) => {
    const body = JSON.stringify({
      text: `${serviceName} ${jobKey}: ${p.title}`,
      blocks: buildBlocks(serviceName, jobKey, p),
      unfurl_links: false,
      unfurl_media: false,
    });
    return postJson(webhookUrl, body);
  });

  return Promise.allSettled(promises);
};

export const config = {
  id: 'slack_with_webhooks',
  name: 'Slack with Webhooks',
  readme: markdown2Html('lib/notification/adapter/slack_with_webhooks.md'),
  description: 'Fredy will send new listings to the slack channel of your choice..',
  fields: {
    webhookUrl: {
      type: 'text',
      label: 'Webhook-Url',
      description: 'The Url of the Webhook to send messages to.',
    },
  },
};
