import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';
import pThrottle from 'p-throttle';
import lodash from 'lodash';

const MAX_ENTITIES_PER_CHUNK = 8;
const RATE_LIMIT_INTERVAL = 1000;
const chatThrottleMap = new Map();
const pollingTokens = new Set();
const updateOffsets = new Map();

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

function getCallbackUpdates(token) {
  const offset = updateOffsets.get(token) || 0;
  return fetch(
    `https://api.telegram.org/bot${token}/getUpdates?allowed_updates=["callback_query"]&timeout=30&offset=${offset}`,
    {
      method: 'get',
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

function getThrottledSend(token, chatId) {
  return getThrottled(chatId, async function (body) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'post',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

async function pollCallbackUpdates(token) {
  setTimeout(() => pollCallbackUpdates(token), 1000);

  let callbackUpdates;
  try {
    callbackUpdates = await getCallbackUpdates(token);
  } catch (error) {
    console.error('An error occurred when polling callback updates.', error);
    return;
  }

  const updatesData = await callbackUpdates.json();

  if (!updatesData.ok || !updatesData.result || updatesData.result.length === 0) {
    return;
  }

  // Process each callback query
  for (const update of updatesData.result) {
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const callbackQueryId = callbackQuery.id;

      try {
        // Answer the callback query to remove the loading state
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'post',
          body: JSON.stringify({
            callback_query_id: callbackQueryId,
            text: '✅ Opening listing...',
            show_alert: false,
          }),
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('Error answering callback query:', error);
      }
    }

    // Update offset to avoid processing the same update again
    updateOffsets.set(token, update.update_id + 1);
  }
}

function startCallbackPolling(token) {
  if (!pollingTokens.has(token)) {
    pollingTokens.add(token);
    pollCallbackUpdates(token);
  }
}

export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { token, chatId } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const throttledSend = getThrottledSend(token, chatId);

  // Start callback polling for this token if not already started
  startCallbackPolling(token);

  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  const chunks = lodash.chunk(newListings, MAX_ENTITIES_PER_CHUNK);

  const promises = chunks.map((listingsInChunk, chunkIndex) => {
    const messageParagraphs = [];
    const inlineButtons = [];

    messageParagraphs.push(
      `<i>${jobName}</i> (${serviceName}) found <b>${newListings.length}</b> new listings (${chunkIndex + 1}/${chunks.length}):`,
    );

    listingsInChunk.forEach((listing, listingIndex) => {
      const normalizedTitle = listing.title.replace(/\*/g, '').trim();
      const titleExcerpt = lodash.truncate(normalizedTitle, { length: 45, omission: '…' });

      messageParagraphs.push(`
${listingIndex + 1}. <a href='${listing.link}'><b>${titleExcerpt}</b></a>
${[listing.address, listing.price, listing.size].join(' | ')}`);

      inlineButtons.push({
        text: `${listingIndex + 1}`,
        url: listing.link,
      });
    });

    return throttledSend({
      chat_id: chatId,
      text: messageParagraphs.join('\n\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: lodash.chunk(inlineButtons, 4),
      },
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
