/**
 * simply prints out the found data to the console
 * @param serviceName e.g immoscout
 * @param newListings an array with newly found listings
 * @param notificationConfig config of this notification adapter
 */
exports.send = (serviceName, newListings, notificationConfig) => {
    const {enabled} = notificationConfig.console;
    if (!enabled) {
        return [Promise.resolve()];
    }
    return [Promise.resolve(console.info(`Found entry from service ${serviceName}:`, newListings))];
};

