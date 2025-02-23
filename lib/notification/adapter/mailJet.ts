import mailjet from 'node-mailjet';
import path from 'path';
import fs from 'fs';
import Handlebars from 'handlebars';
import { markdown2Html } from '#services/markdown';
import { getDirName } from '../../utils';
import {
  NotificationAdapterConfig,
  NotificationAdapterFieldsValue,
  SendNotificationArgs,
} from '#types/NotificationAdapter.ts';

const __dirname = getDirName();
const template = fs.readFileSync(path.resolve(__dirname + '/notification/emailTemplate/template.hbs'), 'utf8');
const emailTemplate = Handlebars.compile(template);

export const send = ({ serviceName, newListings, notificationConfig, jobKey }: SendNotificationArgs) => {
  const adapterConfig = notificationConfig.find((adapter) => adapter.id === config.id);
  if (!adapterConfig) {
    console.error(`No adapter config found for id ${config.id}`);
    return Promise.resolve(null);
  }
  const { apiPublicKey, apiPrivateKey, receiver, from } = adapterConfig.fields;

  const isValid = (field: NotificationAdapterFieldsValue) => {
    return !field || (field.value !== null && field.value !== undefined && field.value !== '');
  };

  if (!isValid(apiPublicKey) || !isValid(apiPrivateKey) || !isValid(receiver) || !isValid(from)) {
    console.error(`Missing required fields in adapter config for id ${config.id}`);
    return Promise.resolve(null);
  }

  const to: { Email: string }[] = (receiver.value as string)
    .trim()
    .split(',')
    .map((r: string) => ({
      Email: r.trim(),
    }));

  return mailjet
    .apiConnect(apiPublicKey.value as string, apiPrivateKey.value as string)
    .post('send', { version: 'v3.1' })
    .request({
      Messages: [
        {
          From: {
            Email: from.value,
            Name: 'Fredy',
          },
          To: to,
          Subject: `Fredy found ${newListings.length} new listings for ${serviceName}`,
          HTMLPart: emailTemplate({
            serviceName: `Job: (${jobKey}) | Service: ${serviceName}`,
            numberOfListings: newListings.length,
            listings: newListings,
          }),
        },
      ],
    });
};

export const config: NotificationAdapterConfig = {
  id: 'mailjet',
  name: 'MailJet',
  description: 'MailJet is being used to send new listings via mail.',
  readme: markdown2Html('lib/notification/adapter/mailJet.md'),
  fields: {
    apiPublicKey: {
      type: 'text',
      label: 'Public Api Key',
      description: 'The public api key needed to access this service.',
    },
    apiPrivateKey: {
      type: 'text',
      label: 'Private Api Key',
      description: 'The private api key needed to access this service.',
    },
    receiver: {
      type: 'email',
      label: 'Receiver Email',
      description: 'The email address (single one) which Fredy is using to send notifications to.',
    },
    from: {
      type: 'email',
      label: 'Sender email',
      description:
        'The email address from which Fredy send email. Beware, this email address needs to be verified by Sendgrid.',
    },
  },
};
