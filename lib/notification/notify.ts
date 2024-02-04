import { Listing } from '../provider/provider.js';
import * as Console from './adapter/console.js';
import * as Mailjet from './adapter/mailJet.js';
import * as MatterMost from './adapter/mattermost.js';
import * as Ntfy from './adapter/ntfy.js';
import * as SendGrid from './adapter/sendGrid.js';
import * as Slack from './adapter/slack.js';
import * as Telegram from './adapter/telegram.js';

const adapters = [Console, Mailjet, MatterMost, Ntfy, SendGrid, Slack, Telegram];

const findAdapter = (notificationAdapter: NotifierAdapterConfig) => {
  return adapters.find((a) => a.config.id === notificationAdapter.id);
};

export type SendRequest = {
  serviceName: string;
  newListings: Listing[];
  notificationConfig: NotifierAdapterConfig[];
  jobKey: string;
};

export const send = ({ serviceName, newListings, notificationConfig, jobKey }: SendRequest) => {
  //this is not being used in tests, therefore adapter are always set
  return notificationConfig
    .filter((notificationAdapter) => findAdapter(notificationAdapter) != null)
    .map((notificationAdapter) => findAdapter(notificationAdapter))
    .map((a) => a.send({ serviceName, newListings, notificationConfig, jobKey }));
};

export interface NotifierAdapter {
  send: ({ serviceName, newListings, notificationConfig, jobKey }: SendRequest) => Promise<any>;
  config: NotifierAdapterConfig;
}
export interface NotifierAdapterConfig {
  id: string;
  name: string;
  description: string;
  fields: any;
  readme: string;
}
