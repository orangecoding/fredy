const config = require('../../../conf/config.json');

/**
 * simply prints out the found data to the console
 * @param serviceName e.g immoscout
 * @param payload the actual payload that is used to construct the message
 * @returns {Promise<Void> | void}
 */
exports.send = (serviceName, payload) => {
    return Promise.resolve(console.info(`Found entry from service ${serviceName}:`, payload))
};

/**
 * each integration needs to implement this method
 */
exports.enabled = () => {
  return config.notification.console.enabled;
};
