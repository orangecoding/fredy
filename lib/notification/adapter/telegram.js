const { markdown2Html } = require('../../services/markdown');
const { getJob } = require('../../services/storage/jobStorage');
const axios = require('axios');

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

const messageHeader = (jobName, serviceName, newListingsCount) => 
  `<i>${jobName}</i> (${serviceName}) found <b>${newListingsCount}</b> new listings:\n\n`;

const chunkToHtml = (chunk) => chunk.map(
  (o) =>
    `<a href="${o.link}"><b>${shorten(o.title.replace(/\*/g, ''), 45).trim()}</b></a>\n` +
    [o.address, o.price, o.size].join(' | ') +
    '\n\n'
  );

/**
 * Executes the given asyncFunctions sequentially, waits for each function to finish
 * and adds a delay before executing the next one.
 * @param maxPerSecond 
 * @param maxPerMinute 
 * @param asyncFunctions 
 */
const executeDelayed = async (maxPerSecond, maxPerMinute, asyncFunctions) => {
  const timeSeconds = seconds => new Promise(res => setTimeout(res, seconds * 1000));
  let secondTimer = timeSeconds(1);
  let minuteTimer = timeSeconds(60);
  for(let i = 1; i <= asyncFunctions.length; i++){
    await asyncFunctions[i - 1]();
    if(i % maxPerSecond === 0){
      await secondTimer;
      secondTimer = timeSeconds(1);
    }
    if(i % maxPerMinute === 0){
      await minuteTimer;
      minuteTimer = timeSeconds(60);
    }
  }
};

/**
 * sends new listings to telegram
 * @param serviceName e.g immowelt
 * @param newListings an array with newly found listings
 * @param notificationConfig config of this notification adapter
 * @param jobKey name of the current job that is being executed
 * @returns {Promise<Void> | void}
 */
exports.send = async ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { token, chatId } = notificationConfig.find((adapter) => adapter.id === 'telegram').fields;
  const job = getJob(jobKey);
  const jobName = job == null ? jobKey : job.name;

  //we have to split messages into chunk, because otherwise messages are going to become too big and will fail
  const chunks = arrayChunks(newListings, 3);

  const htmlMessages = 
    chunks.map((chunk) => messageHeader(jobName, serviceName, newListings.length) + chunkToHtml(chunk));

  // do not send more than one message per second
  // and not more than 20 per minute
  await executeDelayed(1, 20, htmlMessages.map(
    (htmlMessage) => () => axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: htmlMessage,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    })
  ));
};

function shorten(str, len = 30) {
  return str.length > len ? str.substring(0, len) + '...' : str;
}

/**
 * exported config is being used in the frontend to generate the fields
 * incoming values will be the keys (and values) of the fields
 *
 */
exports.config = {
  id: __filename.slice(__dirname.length + 1, -3),
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
