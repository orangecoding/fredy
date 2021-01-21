const fs = require('fs');
const path = './adapter';

/** Read every integration existing in ./adapter **/
const adapter = fs
  .readdirSync('./lib/notification/adapter')
  .filter((file) => file.endsWith('.js'))
  .map((integPath) => require(`${path}/${integPath}`));

if (adapter.length === 0) {
  throw new Error('Please specify at least one notification provider');
}

exports.send = (serviceName, newListings, notificationConfig, jobKey) => {
  //this is not being used in tests, therefore adapter are always set
  return adapter
    .filter((notificationAdapter) => {
      return notificationConfig.find((config) => config.id === notificationAdapter.config.id);
    })
    .map((a) => a.send({ serviceName, newListings, notificationConfig, jobKey }));
};
