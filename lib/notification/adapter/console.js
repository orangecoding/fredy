/**
 * simply prints out the found data to the console
 * @param serviceName e.g immoscout
 * @param newListings an array with newly found listings
 * @param notificationConfig config of this notification adapter
 * @param jobKey name of the current job that is being executed
 */
exports.send = (serviceName, newListings, notificationConfig, jobKey) => {
  const { enabled } = notificationConfig.console;
  if (!enabled) {
    return [Promise.resolve()];
  }
  /* eslint-disable no-console */
  return [Promise.resolve(console.info(`Found entry from service ${serviceName}, Job: ${jobKey}:`, newListings))];
  /* eslint-enable no-console */
};
