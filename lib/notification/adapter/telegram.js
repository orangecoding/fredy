const TelegramBot = require('tg-yarl');

const opts = {parse_mode: 'Markdown'};


/**
 * sends new listings to telegram
 * @param serviceName e.g immoscout
 * @param newListings an array with newly found listings
 * @param notificationConfig config of this notification adapter
 * @returns {Promise<Void> | void}
 */
exports.send = (serviceName, newListings, notificationConfig) => {
    const {enabled, token, chatId} = notificationConfig.telegram;
    if (!enabled) {
        return [Promise.resolve()];
    }

    const bot = new TelegramBot(token);

    let message = `Service _${serviceName}_ found _${newListings.length}_ new listings:\n\n`;

    message += newListings.map(o =>
        `*${shorten(o.title.replace(/\*/g, ''), 45)}*\n` +
        [o.address, o.price, o.size].join(' | ') + '\n' +
        `[LINK](${o.link})\n\n`);

    return bot.sendMessage(chatId, message, opts);
};

function shorten(str, len = 30) {
    return str.length > len ? str.substring(0, len) + '...' : str;
}