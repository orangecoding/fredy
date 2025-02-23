import { markdown2Html } from '#services/markdown.ts';
import { getJob } from '#services/storage/jobStorage.ts';
import { NotificationAdapterConfig, SendNotificationArgs } from '#types/NotificationAdapter.ts';
import { Listing } from '#types/Listings.ts';
import fetch from 'node-fetch';

const MAX_ENTITIES_PER_CHUNK = 8;
const RATE_LIMIT_INTERVAL = 1010;

/**
 * splitting an array into chunks because Telegram only allows for messages up to
 * 4096 chars, thus we have to split messages into chunks
 * @param inputArray
 * @param perChunk
 */
const arrayChunks = <T>(inputArray: T[], perChunk: number): T[][] =>
  inputArray.reduce((all: T[][], one: T, i: number) => {
    const ch = Math.floor(i / perChunk);
    all[ch] = [...(all[ch] || []), one];
    return all;
  }, []);

function shorten(str: string, len = 30) {
  return str.length > len ? str.substring(0, len) + '...' : str;
}

export const send = ({ serviceName, newListings, notificationConfig, jobKey }: SendNotificationArgs) => {
  const adapterConfig = notificationConfig.find((adapter: NotificationAdapterConfig) => adapter.id === config.id);

  if (!adapterConfig) {
    console.error(`No adapter config found for id ${config.id}`);
    return Promise.resolve(null);
  }

  const { token, chatId } = adapterConfig.fields;

  if (!token || !chatId) {
    console.error(`Missing required fields in adapter config for id ${config.id}`);
    return Promise.resolve(null);
  }

  const job = getJob(jobKey);
  const jobName: string = job == null ? jobKey : job.name;
  //we have to split messages into chunk, because otherwise messages are going to become too big and will fail
  const chunks = arrayChunks(newListings, MAX_ENTITIES_PER_CHUNK);
  const promises = chunks.map((chunk: Listing[]) => {
    let message = `<i>${jobName}</i> (${serviceName}) found <b>${newListings.length}</b> new listings:\n\n`;
    message += chunk.map(
      (o: Listing) =>
        `<a href='${o.link}'><b>${shorten(o.title?.replace(/\*/g, '') ?? '', 45).trim()}</b></a>\n` +
        [o.address, o.price, o.size].join(' | ') +
        '\n\n',
    );
    /**
     * This is to not break the rate limit. It is to only send 1 message per second
     */
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        fetch(`https://api.telegram.org/bot${token.value}/sendMessage`, {
          method: 'post',
          body: JSON.stringify({
            chat_id: chatId.value,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
          headers: { 'Content-Type': 'application/json' },
        })
          .then(() => resolve())
          .catch(() => reject());
      }, RATE_LIMIT_INTERVAL);
    });
  });
  return Promise.all(promises);
};

export const config: NotificationAdapterConfig = {
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
      type: 'text',
      label: 'Chat Id',
      description: 'The chat id to send messages to you.',
    },
  },
};
