import { markdown2Html } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import fetch from 'node-fetch';
const MAX_ENTITIES_PER_CHUNK = 8;
const RATE_LIMIT_INTERVAL = 1010;
/**
 * splitting an array into chunks because Telegram only allows for messages up to
 * 4096 chars, thus we have to split messages into chunks
 * @param inputArray
 * @param perChunk
 */
const arrayChunks = (inputArray, perChunk) =>
  inputArray.reduce((all, one, i) => {
    const ch = Math.floor(i / perChunk);
    all[ch] = [].concat(all[ch] || [], one);
    return all;
  }, []);

function shorten(str, len = 45) {
  return str.length > len ? str.substring(0, len) + '...' : str;
}

function isValidURL(url) {
  try {
    new URL(url);
    return true;
  } catch (_) {
    return false;
  }
}

const sendTelegramMessage = (token, chatId, message, isPhoto = false, photoUrl = '') => {
  const url = isPhoto
    ? `https://api.telegram.org/bot${token}/sendPhoto`
    : `https://api.telegram.org/bot${token}/sendMessage`;
  const body = isPhoto
    ? JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption: message,
        parse_mode: 'HTML',
      })
    : JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: !isPhoto,
      });

  /**
   * This is to not break the rate limit. It is to only send 1 message per second
   */
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      fetch(url, {
        method: 'post',
        body: body,
        headers: { 'Content-Type': 'application/json' },
      })
        .then(() => {
          resolve();
        })
        .catch(() => {
          reject();
        });
    }, RATE_LIMIT_INTERVAL);
  });
};

const sendRichMessage = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { token, chatId } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;

  const promises = newListings.map((o, index) => {
    let message = '';
    /**
     * Only send the job information once
     */
    if (index === 0) {
      message += `<i>${jobName}</i> (${serviceName}) found <b>${newListings.length}</b> new listings:\n\n`;
    }
    message +=
      `<a href='${o.link}'><b>${shorten(o.title.replace(/\*/g, '')).trim()}</b></a>\n` +
      `🏠 Address: ${o.address}\n` +
      `💰 Price: ${o.price}\n` +
      `📐 Size: ${o.size}\n`;
    const imageURL = o.lazyImage || o.image;
    return sendTelegramMessage(token, chatId, message, imageURL && isValidURL(imageURL), imageURL);
  });
  return Promise.all(promises);
};

const sendPlainMessage = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { token, chatId } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;
  //we have to split messages into chunk, because otherwise messages are going to become too big and will fail
  const chunks = arrayChunks(newListings, MAX_ENTITIES_PER_CHUNK);
  const promises = chunks.map((chunk) => {
    let message = `<i>${jobName}</i> (${serviceName}) found <b>${newListings.length}</b> new listings:\n\n`;
    message += chunk
      .map(
        (o) =>
          `<a href='${o.link}'><b>${shorten(o.title.replace(/\*/g, '')).trim()}</b></a>\n` +
          [o.address, o.price, o.size].join(' | '),
      )
      .join('\n\n');
    return sendTelegramMessage(token, chatId, message);
  });
  return Promise.all(promises);
};

export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { richMessage } = notificationConfig.find((adapter) => adapter.id === config.id).fields;
  if (richMessage) {
    return sendRichMessage({ serviceName, newListings, notificationConfig, jobKey });
  } else {
    return sendPlainMessage({ serviceName, newListings, notificationConfig, jobKey });
  }
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
    richMessage: {
      type: 'boolean',
      label: 'Send rich message',
      description: 'When selected sends a rich message with image.',
      value: false,
    },
  },
};
