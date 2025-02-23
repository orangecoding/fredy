import sgMail from '@sendgrid/mail';
import { markdown2Html } from '#services/markdown';
import {
  NotificationAdapterConfig,
  NotificationAdapterFieldsValue,
  SendNotificationArgs,
} from '#types/NotificationAdapter.ts';

export const send = ({ serviceName, newListings, notificationConfig, jobKey }: SendNotificationArgs) => {
  const adapterConfig = notificationConfig.find((adapter) => adapter.id === config.id);

  if (!adapterConfig) {
    console.error(`No adapter config found for id ${config.id}`);
    return Promise.resolve(null);
  }

  const apiKey = adapterConfig.fields['apiKey'];
  const receiver = adapterConfig.fields['receiver'];
  const from = adapterConfig.fields['from'];
  const templateId = adapterConfig.fields['templateId'];

  const isValid = (field: NotificationAdapterFieldsValue) => {
    return !field || (field.value !== null && field.value !== undefined && field.value !== '');
  };

  if (!isValid(apiKey) || !isValid(receiver) || !isValid(from) || !isValid(templateId)) {
    console.error(`Missing required fields in adapter config for id ${config.id}`);
    return Promise.resolve(null);
  }

  sgMail.setApiKey(apiKey.value as string);
  const msg = {
    templateId: templateId.value as string,
    to: (receiver.value as string)
      .trim()
      .split(',')
      .map((r: string) => r.trim()),
    from: from.value as string,
    subject: `Job ${jobKey} | Service ${serviceName} found ${newListings.length} new listing(s)`,
    dynamic_template_data: {
      serviceName: `Job: (${jobKey}) | Service: ${serviceName}`,
      numberOfListings: newListings.length,
      listings: newListings,
    },
  };
  return sgMail.send(msg);
};

export const config: NotificationAdapterConfig = {
  id: 'sendgrid',
  name: 'SendGrid',
  description: 'SendGrid is being used to send new listings via mail.',
  readme: markdown2Html('lib/notification/adapter/sendGrid.md'),
  fields: {
    apiKey: {
      type: 'text',
      label: 'Api Key',
      description: 'The api key needed to access this service.',
    },
    receiver: {
      type: 'email',
      label: 'Receiver Email',
      description: 'The email address (single one) which Fredy is using to send notifications to.',
    },
    from: {
      type: 'email',
      label: 'Sender Email',
      description:
        'The email address from which Fredy send email. Beware, this email address needs to be verified by Sendgrid.',
    },
    templateId: {
      type: 'text',
      label: 'Template Id',
      description: 'Sendgrid supports templates which Fredy is using to send out emails that looks awesome ;)',
    },
  },
};
