const { markdown2Html } = require('../../services/markdown');
const axios = require('axios');

/**
 * sends new listings to telegram
 * @param serviceName e.g immowelt
 * @param newListings an array with newly found listings
 * @param notificationConfig config of this notification adapter
 * * @param jobKey name of the current job that is being executed
 * @returns {Promise<Void> | void}
 */
exports.send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { token, chatId } = notificationConfig.find((adapter) => adapter.id === 'telegram').fields;

  let message = `Job: ${jobKey} | Service <b>${serviceName}</b> found <b>${newListings.length}</b> new listings:\n\n`;

  message += newListings.map(
    (o) =>
      `<b>${shorten(o.title.replace(/\*/g, ''), 45)}</b>\n` +
      [o.address, o.price, o.size].join(' | ') +
      '\n' +
      `<a href="${o.link}">${o.link}</a>\n\n`
  );

  return axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
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
