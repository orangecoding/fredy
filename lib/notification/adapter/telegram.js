const config = require('../../../conf/config.json');
const TelegramBot = require('tg-yarl');

const opts = { parse_mode: 'Markdown' };
const bot = new TelegramBot(config.notification.telegram.token);


/**
 * sends new listings to telegram
 * @param serviceName e.g immoscout
 * @param newListings an array with newly found listings
 * @returns {Promise<Void> | void}
 */
exports.send = (serviceName, newListings) => {
    let message = `Service _${serviceName}_ found _${newListings.length}_ new listings:\n\n`;

    message += newListings.map(o =>
            `*${shorten(o.title.replace(/\*/g, ''), 45)}*\n` +
            [o.address, o.price, o.size].join(' | ') + '\n' +
            `[LINK](${o.link})\n\n`);

    return bot.sendMessage(config.notification.telegram.chatId, message, opts);
};

/**
 * each integration needs to implement this method
 */
exports.enabled = () => {
    return config.notification.telegram.enabled;
};


function shorten (str, len = 30) {
    return str.length > len ? str.substring(0, len) + '...' : str;
}