import fs from 'fs';
const path = './adapter';

/** Read every integration existing in ./adapter **/
const adapter = fs
  .readdirSync('./lib/notification/adapter')
  .filter((file) => file.endsWith('.js'))
  .map((integPath) => require(`${path}/${integPath}`));

if (adapter.length === 0) {
  throw new Error('Please specify at least one notification provider');
}

export const send = (serviceName, newListings, notificationConfig, jobKey) => {
  //this is not being used in tests, therefore adapter are always set
  return notificationConfig
    .filter((notificationAdapter) => findAdapter(notificationAdapter) != null)
    .map((notificationAdapter) => findAdapter(notificationAdapter))
    .map((a) => a.send({ serviceName, newListings, notificationConfig, jobKey }));
};

const findAdapter = (notificationAdapter) => {
  return adapter.find((a) => a.config.id === notificationAdapter.id);
};
