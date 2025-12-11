/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';
import pThrottle from 'p-throttle';
import { normalizeImageUrl } from '../../utils.js';
import logger from '../../services/logger.js';

const RATE_LIMIT_INTERVAL = 1000;
const chatThrottleMap = new Map();

/**
 * Removes stale throttled call entries to keep memory bounded.
 */
function cleanupOldThrottles() {
  const now = Date.now();
  const maxAge = RATE_LIMIT_INTERVAL + 1000;
  const toBeDeleted = [];
  for (const [chatId, chatThrottle] of chatThrottleMap.entries()) {
    if (now - chatThrottle.lastUsedAt > maxAge) toBeDeleted.push(chatId);
  }
  for (const chatId of toBeDeleted) chatThrottleMap.delete(chatId);
}

/**
 * Return a throttled wrapper for a chatId to limit Telegram API calls.
 * Uses p-throttle with 1 request per RATE_LIMIT_INTERVAL per chat.
 *
 * @template {Function} T
 * @param {string|number} chatId
 * @param {T} call - async function (endpoint: string, body: any) => Promise<Response>
 * @returns {T}
 */
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

/**
 * Shorten a string to a maximum length with an ellipsis suffix.
 * @param {string} str
 * @param {number} [len=90]
 * @returns {string}
 */
function shorten(str, len = 90) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len).trim() + '...' : str;
}

/**
 * Escape basic HTML entities for Telegram HTML parse mode.
 * @param {string} [s='']
 * @returns {string}
 */
function escapeHtml(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build a Telegram photo caption (max 1024 characters) using HTML parse mode.
 * @param {string} jobName
 * @param {string} serviceName
 * @param {Object} o - Listing object
 * @param {string} [o.title]
 * @param {string} [o.address]
 * @param {string|number} [o.price]
 * @param {string|number} [o.size]
 * @param {string} [o.link]
 * @returns {string}
 */
function buildCaption(jobName, serviceName, o) {
  const title = shorten((o.title || '').replace(/\*/g, ''), 90);
  const meta = [o.address, o.price, o.size].filter(Boolean).join(' | ');
  return `<i>${escapeHtml(jobName)}</i> (${escapeHtml(serviceName)})\n<a href='${escapeHtml(
    o.link || '',
  )}'><b>${escapeHtml(title)}</b></a>\n${escapeHtml(meta)}`.slice(0, 1024);
}

/**
 * Build a Telegram message text using HTML parse mode.
 * @param {string} jobName
 * @param {string} serviceName
 * @param {Object} o - Listing object
 * @returns {string}
 */
function buildText(jobName, serviceName, o) {
  const title = shorten((o.title || '').replace(/\*/g, ''), 90);
  const meta = [o.address, o.price, o.size].filter(Boolean).join(' | ');
  return (
    `<i>${escapeHtml(jobName)}</i> (${escapeHtml(serviceName)})\n` +
    `<a href='${escapeHtml(o.link || '')}'><b>${escapeHtml(title)}</b></a>\n` +
    `${escapeHtml(meta)}`
  );
}

/**
 * Send new listings to Telegram.
 * - Respects per-chat Telegram rate limits using a lightweight throttle cache.
 * - Falls back to sendMessage when sendPhoto fails or image is missing.
 *
 * @param {Object} params
 * @param {string} params.serviceName - Name of the crawler/service producing the listings.
 * @param {Array<Object>} params.newListings - Array of new listing objects.
 * @param {Array<Object>} params.notificationConfig - Notification adapters configuration array.
 * @param {string} params.jobKey - Storage job key to resolve the human readable job name.
 * @returns {Promise<Array<Response>>} Promise resolving when all send operations complete.
 */
export const send = ({ serviceName, newListings = [], notificationConfig, jobKey }) => {
  const adapterCfg = notificationConfig.find((adapter) => adapter.id === config.id);
  if (!adapterCfg || !adapterCfg.fields) {
    throw new Error(`Telegram adapter configuration missing for job '${jobKey || ''}'`);
  }
  const { token, chatId, messageThreadId } = adapterCfg.fields;
  if (!token || !chatId) {
    throw new Error("Telegram 'token' and 'chatId' must be provided in notification config");
  }

  // Optional Telegram topic/thread support (supergroups)
  let message_thread_id;
  if (messageThreadId !== undefined && messageThreadId !== null && `${messageThreadId}`.trim() !== '') {
    const n = Number(messageThreadId);
    if (Number.isInteger(n) && n > 0) {
      message_thread_id = n;
    } else {
      logger.warn(
        `Telegram adapter: 'messageThreadId' is invalid ('${messageThreadId}'). It must be a positive integer. Ignoring.`,
      );
    }
  }

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

  if (!Array.isArray(newListings) || newListings.length === 0) return Promise.resolve([]);

  const promises = newListings.map(async (o) => {
    const img = normalizeImageUrl(o.image);
    const textPayload = {
      chat_id: chatId,
      text: buildText(jobName, serviceName, o),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(message_thread_id ? { message_thread_id } : {}),
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
      ...(message_thread_id ? { message_thread_id } : {}),
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

/**
 * Telegram notification adapter configuration schema.
 * @type {{id:string,name:string,readme:string,description:string,fields:{token:{type:string,label:string,description:string},chatId:{type:string,label:string,description:string},messageThreadId?:{type:string,label:string,description:string}}}}
 */
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
    messageThreadId: {
      type: 'text',
      optional: true,
      label: 'Message Thread Id (optional)',
      description:
        'Optional: The topic/thread id within a supergroup to post into (Telegram message_thread_id). Provide a positive integer.',
    },
  },
};
