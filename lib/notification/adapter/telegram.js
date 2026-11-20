/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readAdapterReadme } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';
import pThrottle from 'p-throttle';
import { normalizeImageUrl } from '../../utils.js';
import logger from '../../services/logger.js';
import { shouldUseMultipart, buildPhotoFormData } from './telegramPhotoUploader.js';
import { toPriceChangeListing } from '../priceChangeMessage.js';
import { applicationDraftOf } from '../applicationDraftMessage.js';

const DEFAULT_API_URL = 'https://api.telegram.org';
const RATE_LIMIT_INTERVAL = 1000;
const THROTTLE_MAX_IDLE_MS = RATE_LIMIT_INTERVAL + 2000;
const chatThrottleMap = new Map();

/**
 * Removes stale throttled call entries to keep memory bounded.
 * An entry is stale when no API call has fired for longer than THROTTLE_MAX_IDLE_MS.
 */
function cleanupOldThrottles() {
  const now = Date.now();
  for (const [chatId, chatThrottle] of chatThrottleMap.entries()) {
    if (now - chatThrottle.lastUsedAt > THROTTLE_MAX_IDLE_MS) chatThrottleMap.delete(chatId);
  }
}

/**
 * Return a throttled wrapper for a chatId to limit Telegram API calls.
 * Uses p-throttle with 1 request per RATE_LIMIT_INTERVAL per chat.
 * `lastUsedAt` is refreshed on every actual API call so that the idle window
 * starts from the last fired call, not from when send() was invoked.
 *
 * @param {string|number} chatId
 * @param {Function} call - async function (endpoint: string, body: any) => Promise<Response>
 * @returns {Function}
 */
function getThrottled(chatId, call) {
  cleanupOldThrottles();
  const existing = chatThrottleMap.get(chatId);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.throttled;
  }
  const entry = { lastUsedAt: Date.now(), throttled: null };
  chatThrottleMap.set(chatId, entry);
  entry.throttled = pThrottle({ limit: 1, interval: RATE_LIMIT_INTERVAL })(async (endpoint, body) => {
    const e = chatThrottleMap.get(chatId);
    if (e) e.lastUsedAt = Date.now();
    return call(endpoint, body);
  });
  return entry.throttled;
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
 * Build a Telegram HTML-formatted message body.
 * Suitable for both sendMessage (uncapped) and sendPhoto captions (caller must slice to 1024).
 *
 * @param {string} jobName
 * @param {string} serviceName
 * @param {Object} o - Listing object
 * @param {string} [baseUrl]
 * @returns {string}
 */
function buildHtmlBody(jobName, serviceName, o, baseUrl) {
  const title = shorten((o.title || '').replace(/\*/g, ''), 90);
  const meta = [o.address, o.price, o.size, o.commute].filter(Boolean).join(' | ');
  const fredyLink =
    baseUrl && o.id ? `\n<a href='${escapeHtml(`${baseUrl}/#/listings/listing/${o.id}`)}'>Open in Fredy</a>` : '';
  return (
    `<i>${escapeHtml(jobName)}</i> (${escapeHtml(serviceName)})\n` +
    `<a href='${escapeHtml(o.link || '')}'><b>${escapeHtml(title)}</b></a>\n` +
    `${escapeHtml(meta)}${fredyLink}`
  );
}

/**
 * Build a plain-text Telegram photo caption (max 4096 characters).
 * Meta appears before the link so the most relevant info is visible within the cap.
 *
 * @param {string} jobName
 * @param {string} serviceName
 * @param {Object} o - Listing object
 * @param {string} [baseUrl]
 * @returns {string}
 */
function buildPlainCaption(jobName, serviceName, o, baseUrl) {
  const title = shorten((o.title || '').replace(/\*/g, ''), 90);
  const meta = [o.address, o.price, o.size, o.commute].filter(Boolean).join(' | ');
  const fredyLine = baseUrl && o.id ? `\nOpen in Fredy: ${baseUrl}/#/listings/listing/${o.id}` : '';
  return `${jobName} (${serviceName})\n${title}\n${meta}\n\n${o.link || ''}${fredyLine}`.slice(0, 4096);
}

/**
 * Build a plain-text Telegram message body.
 * Link appears early so it is tappable without scrolling.
 *
 * @param {string} jobName
 * @param {string} serviceName
 * @param {Object} o - Listing object
 * @param {string} [baseUrl]
 * @returns {string}
 */
function buildPlainText(jobName, serviceName, o, baseUrl) {
  const title = shorten((o.title || '').replace(/\*/g, ''), 90);
  const meta = [o.address, o.price, o.size, o.commute].filter(Boolean).join(' | ');
  const fredyLine = baseUrl && o.id ? `\nOpen in Fredy: ${baseUrl}/#/listings/listing/${o.id}` : '';
  return `${jobName} (${serviceName})\n${title}\n${o.link || ''}\n${meta}${fredyLine}`;
}

/**
 * Resolve the Telegram API base url.
 * Anything missing, unparsable or not http(s) falls back to the official endpoint with a warning,
 * so a broken relay url can never take notifications down.
 *
 * @param {string} [apiUrl] - Optional user configured base url (e.g. a Telegram API relay).
 * @returns {string} Base url without trailing slashes.
 */
function resolveApiUrl(apiUrl) {
  const raw = typeof apiUrl === 'string' ? apiUrl.trim() : '';
  if (raw === '') return DEFAULT_API_URL;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = null;
  }
  if (parsed == null || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    logger.warn(`Telegram adapter: 'apiUrl' is invalid ('${apiUrl}'). Falling back to ${DEFAULT_API_URL}.`);
    return DEFAULT_API_URL;
  }
  return raw.replace(/\/+$/, '');
}

/**
 * Create the raw Telegram API caller for a given bot token.
 * Handles JSON and multipart (FormData) bodies.
 *
 * @param {string} token - Telegram bot token.
 * @param {string} jobName - Used in error messages.
 * @param {string} apiUrl - Telegram API base url, already resolved.
 * @returns {(endpoint: string, body: object|FormData) => Promise<Response>}
 */
function makeTelegramCaller(token, jobName, apiUrl) {
  return async function (endpoint, body) {
    const isFormData = body instanceof FormData;
    const opts = isFormData
      ? { method: 'post', body }
      : { method: 'post', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
    const res = await fetch(`${apiUrl}/bot${token}/${endpoint}`, opts);
    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`API error for '${jobName}'. '${endpoint}' returned ${errorBody}`);
    }
    return res;
  };
}

/** Telegram's limit on the text of one message. */
const TELEGRAM_TEXT_LIMIT = 4096;

/**
 * The id Telegram gave a sent message, read off the Bot API answer.
 *
 * @param {Response|undefined} response What `throttledCall` resolved to for that message.
 * @returns {Promise<number|null>} `null` when the answer carries none or cannot be read.
 */
async function sentMessageId(response) {
  if (typeof response?.text !== 'function') return null;
  try {
    const id = JSON.parse(await response.text())?.result?.message_id;
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Send a listing's LLM application draft as its own message, as a reply to the listing.
 *
 * Plain text, always: the draft is something to copy into a portal's contact form, and with no
 * `parse_mode` there is nothing to escape and no entity a length cap could cut in half. The reply
 * is what ties it to its listing on screen; `allow_sending_without_reply` still delivers it when the
 * listing message is gone. A draft that fails to send is only logged, since the listing it belongs
 * to already reached the chat.
 *
 * @param {Function} throttledCall - Throttled Telegram API caller for this chat.
 * @param {string} draft - The draft text, non-empty.
 * @param {string|number} chatId
 * @param {number|null} replyToMessageId - The listing message's id, when Telegram returned one.
 * @param {number|undefined} message_thread_id
 * @returns {Promise<void>}
 */
async function sendApplicationDraftToChat(throttledCall, draft, chatId, replyToMessageId, message_thread_id) {
  try {
    await throttledCall('sendMessage', {
      chat_id: chatId,
      text: draft.slice(0, TELEGRAM_TEXT_LIMIT),
      disable_web_page_preview: true,
      ...(replyToMessageId != null
        ? { reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true } }
        : {}),
      ...(message_thread_id ? { message_thread_id } : {}),
    });
  } catch (e) {
    logger.error(`Error sending application draft to Telegram: ${e.message}`);
  }
}

/**
 * Send a single listing to a single Telegram chat, with photo-then-text fallback, followed by its
 * application draft when it has one.
 *
 * The draft goes out only once the listing did: a draft whose listing never arrived would be a
 * letter about a flat the chat has not seen.
 *
 * @param {Function} throttledCall - Throttled Telegram API caller for this chat.
 * @param {Object} listing - Listing object.
 * @param {string|number} chatId
 * @param {Object} opts
 * @param {string} opts.jobName
 * @param {string} opts.serviceName
 * @param {string} opts.baseUrl
 * @param {boolean} opts.plainText
 * @param {number|undefined} opts.message_thread_id
 * @returns {Promise<Response|undefined>} The listing message's response, its body already read when
 *   a draft followed; `undefined` when the message failed.
 */
async function sendListingToChat(throttledCall, listing, chatId, opts) {
  const response = await sendListingMessage(throttledCall, listing, chatId, opts);
  const draft = applicationDraftOf(listing);
  // Checked before the answer is read, so a listing without a draft is sent exactly as before.
  if (response != null && draft.length > 0) {
    const replyTo = await sentMessageId(response);
    await sendApplicationDraftToChat(throttledCall, draft, chatId, replyTo, opts.message_thread_id);
  }
  return response;
}

/**
 * Send the listing message itself: a photo with caption, or text when there is no photo or the
 * photo fails.
 *
 * @param {Function} throttledCall - Throttled Telegram API caller for this chat.
 * @param {Object} listing - Listing object.
 * @param {string|number} chatId
 * @param {Object} opts - See {@link sendListingToChat}.
 * @returns {Promise<Response|undefined>} `undefined` when a text-only message failed (logged).
 * @throws {Error} When both the photo and the text fallback failed.
 */
async function sendListingMessage(
  throttledCall,
  listing,
  chatId,
  { jobName, serviceName, baseUrl, plainText, message_thread_id },
) {
  const img = normalizeImageUrl(listing.image);

  const textPayload = {
    chat_id: chatId,
    text: plainText
      ? buildPlainText(jobName, serviceName, listing, baseUrl)
      : buildHtmlBody(jobName, serviceName, listing, baseUrl),
    ...(plainText ? {} : { parse_mode: 'HTML' }),
    disable_web_page_preview: true,
    ...(message_thread_id ? { message_thread_id } : {}),
  };

  if (!img) {
    return throttledCall('sendMessage', textPayload).catch((e) => {
      logger.error(`Error sending message to Telegram: ${e.message}`);
    });
  }

  const caption = plainText
    ? buildPlainCaption(jobName, serviceName, listing, baseUrl)
    : buildHtmlBody(jobName, serviceName, listing, baseUrl).slice(0, 1024);
  const parseMode = plainText ? undefined : 'HTML';

  // .webp URLs (Immowelt/Cloudimage) fail Telegram's URL-based sendPhoto with
  // "failed to get HTTP URL content". Upload the bytes via multipart instead.
  const photoCall = shouldUseMultipart(img)
    ? buildPhotoFormData({ chatId, imageUrl: img, caption, parseMode, messageThreadId: message_thread_id }).then((fd) =>
        throttledCall('sendPhoto', fd),
      )
    : throttledCall('sendPhoto', {
        chat_id: chatId,
        photo: img,
        caption,
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(message_thread_id ? { message_thread_id } : {}),
      });

  return photoCall.catch(async (e) => {
    logger.warn(`Error sending photo to Telegram and use a fallback: ${e.message}`);
    return throttledCall('sendMessage', textPayload).catch((e) => {
      logger.error(`Error sending message to Telegram: ${e.message}`);
      throw e;
    });
  });
}

/**
 * Run one send per item, each starting once the one before it has settled.
 *
 * Telegram's per-chat throttle is first come, first served. With every listing started at once, a
 * listing's application draft - which can only be queued after its listing went out - landed behind
 * every other listing of the batch. One after the other, each draft follows its own listing. The
 * throttle spaces the messages a second apart either way, so this costs no time worth counting.
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T) => Promise<any>} sendOne
 * @returns {Promise<any>[]} One promise per item, settling as that item's send does, so a
 *   `Promise.all` over them fails exactly as it did over the concurrent sends.
 */
function sendInOrder(items, sendOne) {
  let previous = Promise.resolve();
  return items.map((item) => {
    const current = previous.then(() => sendOne(item));
    // The chain moves on past a failure; the failure itself is the caller's to see, on `current`.
    previous = current.catch(() => {});
    return current;
  });
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
export const send = ({ serviceName, newListings = [], notificationConfig, jobKey, baseUrl }) => {
  const adapterCfg = notificationConfig.find((adapter) => adapter.id === config.id);
  if (!adapterCfg || !adapterCfg.fields) {
    throw new Error(`Telegram adapter configuration missing for job '${jobKey || ''}'`);
  }
  const { token, chatId, messageThreadId, plainText, apiUrl } = adapterCfg.fields;
  if (!token || !chatId) {
    throw new Error("Telegram 'token' and 'chatId' must be provided in notification config");
  }

  const chatIds = String(chatId)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

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

  if (!Array.isArray(newListings) || newListings.length === 0) return Promise.resolve([]);

  const resolvedApiUrl = resolveApiUrl(apiUrl);
  const allPromises = chatIds.flatMap((id) => {
    const caller = makeTelegramCaller(token, jobName, resolvedApiUrl);
    const throttledCall = getThrottled(id, caller);
    const opts = { jobName, serviceName, baseUrl, plainText, message_thread_id };
    return sendInOrder(newListings, (listing) => sendListingToChat(throttledCall, listing, id, opts));
  });

  return Promise.all(allPromises);
};

/**
 * Telegram notification adapter configuration schema.
 * @type {{id:string,name:string,readme:string,description:string,fields:{token:{type:string,label:string,description:string},chatId:{type:string,label:string,description:string},messageThreadId?:{type:string,label:string,description:string}}}}
 */
/**
 * Sends price changes over the same throttled per-chat path as new listings.
 *
 * Reusing `sendListingToChat` matters more here than the wording does: Telegram rate-limits per
 * chat, and a second, unthrottled path would be the one that trips the limit and takes the new
 * listing notifications down with it.
 *
 * @param {{serviceName: string, priceChanges: any[], notificationConfig: any[], jobKey: string, baseUrl: string}} params
 * @returns {Promise<any>}
 */
export const sendPriceChange = ({ serviceName, priceChanges = [], notificationConfig, jobKey, baseUrl }) => {
  const adapterCfg = notificationConfig.find((adapter) => adapter.id === config.id);
  if (!adapterCfg || !adapterCfg.fields) {
    throw new Error(`Telegram adapter configuration missing for job '${jobKey || ''}'`);
  }
  const { token, chatId, messageThreadId, plainText, apiUrl } = adapterCfg.fields;
  if (!token || !chatId) {
    throw new Error("Telegram 'token' and 'chatId' must be provided in notification config");
  }
  if (!Array.isArray(priceChanges) || priceChanges.length === 0) return Promise.resolve([]);

  const chatIds = String(chatId)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let message_thread_id;
  if (messageThreadId !== undefined && messageThreadId !== null && `${messageThreadId}`.trim() !== '') {
    const n = Number(messageThreadId);
    if (Number.isInteger(n) && n > 0) {
      message_thread_id = n;
    }
  }

  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;

  const resolvedApiUrl = resolveApiUrl(apiUrl);
  const allPromises = chatIds.flatMap((id) => {
    const caller = makeTelegramCaller(token, jobName, resolvedApiUrl);
    const throttledCall = getThrottled(id, caller);
    const opts = { jobName, serviceName, baseUrl, plainText, message_thread_id };
    return priceChanges.map((change) => sendListingToChat(throttledCall, toPriceChangeListing(change), id, opts));
  });

  return Promise.all(allPromises);
};

export const config = {
  id: 'telegram',
  name: 'Telegram',
  readme: readAdapterReadme('telegram.md'),
  description: 'Fredy will send new listings to your mobile, using Telegram.',
  fields: {
    token: {
      type: 'text',
      label: 'Token',
      description: 'The token needed to access this service.',
      // Never leaves the server for anyone who may not edit this channel.
      secret: true,
    },
    chatId: {
      type: 'chatId',
      label: 'Chat Id',
      description:
        'The chat ID to send messages to. Separate multiple IDs with commas to notify several recipients (e.g. 123456789, 987654321).',
      // Shown as the channel's destination in the UI.
      target: true,
    },
    messageThreadId: {
      type: 'text',
      optional: true,
      label: 'Message Thread Id (optional)',
      description:
        'Optional: The topic/thread id within a supergroup to post into (Telegram message_thread_id). Provide a positive integer.',
    },
    plainText: {
      type: 'boolean',
      optional: true,
      label: 'Send as plain text',
      description: 'Send messages as plain text instead of HTML formatted.',
    },
    apiUrl: {
      type: 'text',
      optional: true,
      label: 'API Url (optional)',
      description: `Optional: Base url of a Telegram API relay (e.g. https://telegram.example.com). Leave empty to use ${DEFAULT_API_URL}.`,
    },
  },
};
