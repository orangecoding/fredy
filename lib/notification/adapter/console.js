const config = require('../../../conf/config.json');

/**
 * simply prints out the found data to the console
 * @param serviceName e.g immoscout
 * @param newListings an array with newly found listings
 */
exports.send = (serviceName, newListings) => {
    return [Promise.resolve(console.info(`Found entry from service ${serviceName}:`, newListings))];
};

/**
 * each integration needs to implement this method
 */
exports.enabled = () => {
  return config.notification.console.enabled;
};
