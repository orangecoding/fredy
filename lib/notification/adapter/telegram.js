import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';
import pThrottle from 'p-throttle';
import { normalizeImageUrl } from '../../utils.js';
import logger from '../../services/logger.js';

const RATE_LIMIT_INTERVAL = 1000;
const chatThrottleMap = new Map();

function cleanupOldThrottles() {
  const now = Date.now();
  const maxAge = RATE_LIMIT_INTERVAL + 1000;
  const toBeDeleted = [];
  for (const [chatId, chatThrottle] of chatThrottleMap.entries()) {
    if (now - chatThrottle.lastUsedAt > maxAge) toBeDeleted.push(chatId);
  }
  for (const chatId of toBeDeleted) chatThrottleMap.delete(chatId);
}

function getThrottled(chatId, call) {
  cleanupOldThrottles();
  const now = Date.now();
  const chatThrottle = chatThrottleMap.get(chatId);
  if (chatThrottle) {
    chatThrottle.lastUsedAt = now;
    return chatThrottle.throttled;
  }
  const throttled = pThrottle({ limit: 1, interval: RATE_LIMIT_INTERVAL })(call);
  chatThrottleMap.set(chatId, { lastUsedAt: now, throttled });
  return throttled;
}

function shorten(str, len = 90) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len).trim() + '...' : str;
}

function escapeHtml(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildCaption(jobName, serviceName, o) {
  const title = shorten((o.title || '').replace(/\*/g, ''), 90);
  const meta = [o.address, o.price, o.size].filter(Boolean).join(' | ');
  return `<i>${escapeHtml(jobName)}</i> (${escapeHtml(serviceName)})\n<a href='${escapeHtml(
    o.link || '',
  )}'><b>${escapeHtml(title)}</b></a>\n${escapeHtml(meta)}`.slice(0, 1024);
}

function buildText(jobName, serviceName, o) {
  const title = shorten((o.title || '').replace(/\*/g, ''), 90);
  const meta = [o.address, o.price, o.size].filter(Boolean).join(' | ');
  return (
    `<i>${escapeHtml(jobName)}</i> (${escapeHtml(serviceName)})\n` +
    `<a href='${escapeHtml(o.link || '')}'><b>${escapeHtml(title)}</b></a>\n` +
    `${escapeHtml(meta)}`
  );
}

export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { token, chatId } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;

  const throttledCall = getThrottled(chatId, async function (endpoint, body) {
    const res = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
      method: 'post',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`API error for '${jobName}'. '${endpoint}' returned ${errorBody}`);
    }
    return res;
  });

  const promises = newListings.map(async (o) => {
    const img = normalizeImageUrl(o.image);
    const textPayload = {
      chat_id: chatId,
      text: buildText(jobName, serviceName, o),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };

    if (!img) {
      return await throttledCall('sendMessage', textPayload).catch(async (e) => {
        logger.error(`Error sending message to Telegram: ${e.message}`);
      });
    }

    return await throttledCall('sendPhoto', {
      chat_id: chatId,
      photo: img,
      caption: buildCaption(jobName, serviceName, o),
      parse_mode: 'HTML',
    }).catch(async (e) => {
      logger.error(`Error sending photo to Telegram and use a fallback: ${e.message}`);
      return await throttledCall('sendMessage', textPayload).catch((e) => {
        logger.error(`Error sending message to Telegram: ${e.message}`);
        throw e;
      });
    });
  });

  return Promise.all(promises);
};

export const config = {
  id: 'telegram',
  name: 'Telegram',
  readme: markdown2Html('lib/notification/adapter/telegram.md'),
  description: 'Fredy will send new listings to your mobile, using Telegram.',
  fields: {
    token: {
      type: 'text',
      label: 'Token',
      description: 'The token needed to access this service.',
    },
    chatId: {
      type: 'chatId',
      label: 'Chat Id',
      description: 'The chat id to send messages to you.',
    },
  },
};
