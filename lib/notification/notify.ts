import fs from 'fs';
const path = './adapter';

/** Read every integration existing in ./adapter **/
// @ts-expect-error TS(1378): Top-level 'await' expressions are only allowed whe... Remove this comment to see the full error message
const adapter = await Promise.all(
  fs
    .readdirSync('./lib/notification/adapter')
    .filter((file) => file.endsWith('.js'))
    .map(async (integPath) => await import(`${path}/${integPath}`))
);

if (adapter.length === 0) {
  throw new Error('Please specify at least one notification provider');
}
const findAdapter = (notificationAdapter: any) => {
  return adapter.find((a) => a.config.id === notificationAdapter.id);
};
export const send = (serviceName: any, newListings: any, notificationConfig: any, jobKey: any) => {
  //this is not being used in tests, therefore adapter are always set
  return notificationConfig
    .filter((notificationAdapter: any) => findAdapter(notificationAdapter) != null)
    .map((notificationAdapter: any) => findAdapter(notificationAdapter))
    .map((a: any) => a.send({ serviceName, newListings, notificationConfig, jobKey }));
};
