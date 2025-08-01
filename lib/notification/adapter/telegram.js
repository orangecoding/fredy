import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';
import { chunk, truncate } from 'lodash';
import pThrottle from 'p-throttle';

const MAX_ENTITIES_PER_CHUNK = 8;
const RATE_LIMIT_INTERVAL = 1000;
const chatThrottleMap = new Map();

function cleanupOldThrottles() {
  const now = Date.now();
  const maxAge = RATE_LIMIT_INTERVAL + 1000; // adding extra second
  const toBeDeleted = [];

  for (const [chatId, chatThrottle] of chatThrottleMap.entries()) {
    if (now - chatThrottle.lastUsedAt > maxAge) {
      toBeDeleted.push(chatId);
    }
  }

  for (const chatId of toBeDeleted) {
    chatThrottleMap.delete(chatId);
  }
}

/**
 * Returns a throttled async function for sending messages to a specific chat.
 * Telegram enforces a rate limit of 1 message per second per chat (chatId).
 *
 * @param {number} chatId - The chat ID to throttle messages for.
 * @param {Function} fn - The async function to throttle (should send the message).
 * @returns {Function} Throttled async function for sending messages.
 */
function getThrottled(chatId, call) {
  cleanupOldThrottles();

  const now = Date.now();
  const chatThrottle = chatThrottleMap.get(chatId);

  if (chatThrottle) {
    chatThrottle.lastUsedAt = now;
    return chatThrottle.throttled;
  }

  // Create new throttled function
  const newThrottle = {
    lastUsedAt: now,
    throttled: pThrottle({ limit: 1, interval: RATE_LIMIT_INTERVAL })(call),
  };
  chatThrottleMap.set(chatId, newThrottle);
  return newThrottle.throttled;
}

/**
 * splitting an array into chunks because Telegram only allows for messages up to
 * 4096 chars, thus we have to split messages into chunks
 * @param inputArray
 * @param perChunk
 */

export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { token, chatId } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;

  // we have to split messages into chunks, because otherwise messages are going to become too big and will fail
  const chunks = chunk(newListings, MAX_ENTITIES_PER_CHUNK);

  const getThrottledSend = getThrottled(chatId, async function (body) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'post',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const promises = chunks.map((chunk) => {
    const messageParagraphs = [];

    messageParagraphs.push(`<i>${jobName}</i> (${serviceName}) found <b>${newListings.length}</b> new listings:`);
    messageParagraphs.push(
      ...chunk.map((o) => {
        const normalizedTitle = o.title.replace(/\*/g, '');
        const titleExcerpt = truncate(normalizedTitle, { length: 45, omission: '…' });

        return `<a href='${o.link}'><b>${titleExcerpt}</b></a>\n` + [o.address, o.price, o.size].join(' | ');
      }),
    );

    const body = {
      chat_id: chatId,
      text: messageParagraphs.join('\n\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };

    return getThrottledSend(body);
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
