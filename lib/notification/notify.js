import notificationAdapters from './adapter/index.js';

const findAdapter = (notificationAdapter) => {
  return notificationAdapters.find((a) => a.config.id === notificationAdapter.id);
};
export const send = (serviceName, newListings, notificationConfig, jobKey) => {
  //this is not being used in tests, therefore adapter are always set
  return notificationConfig
    .filter((notificationAdapter) => findAdapter(notificationAdapter) != null)
    .map((notificationAdapter) => findAdapter(notificationAdapter))
    .map((a) => a.send({ serviceName, newListings, notificationConfig, jobKey }));
};
