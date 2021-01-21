const { markdown2Html } = require('../../services/markdown');

/**
 * simply prints out the found data to the console
 * @param serviceName e.g immowelt
 * @param newListings an array with newly found listings
 * @param jobKey name of the current job that is being executed
 */
exports.send = ({ serviceName, newListings, jobKey }) => {
  /* eslint-disable no-console */
  return [Promise.resolve(console.info(`Found entry from service ${serviceName}, Job: ${jobKey}:`, newListings))];
  /* eslint-enable no-console */
};

exports.config = {
  id: __filename.slice(__dirname.length + 1, -3),
  name: 'Console',
  description: 'This adapter sends new listings to the console. It is mostly useful for debugging.',
  config: {},
  readme: markdown2Html('lib/notification/adapter/console.md'),
};
