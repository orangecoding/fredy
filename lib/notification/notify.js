import fs from 'fs';
const path = './adapter';

/** Read every integration existing in ./adapter **/
const adapter = await Promise.all(
  fs
    .readdirSync('./lib/notification/adapter')
    .filter((file) => file.endsWith('.js'))
    .map(async (integPath) => await import(`${path}/${integPath}`))
);

if (adapter.length === 0) {
  throw new Error('Please specify at least one notification provider');
}
const findAdapter = (notificationAdapter) => {
  return adapter.find((a) => a.config.id === notificationAdapter.id);
};
export const send = (serviceName, newListings, notificationConfig, jobKey) => {
  //this is not being used in tests, therefore adapter are always set
  return notificationConfig
    .filter((notificationAdapter) => findAdapter(notificationAdapter) != null)
    .map((notificationAdapter) => findAdapter(notificationAdapter))
    .map((a) => a.send({ serviceName, newListings, notificationConfig, jobKey }));
};
