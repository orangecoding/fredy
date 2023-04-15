import mailjet from 'node-mailjet';
import path from 'path';
import fs from 'fs';
import Handlebars from 'handlebars';
import { markdown2Html } from '../../services/markdown.js';
import { getDirName } from '../../utils.js';
const __dirname = getDirName();
const template = fs.readFileSync(path.resolve(__dirname + '/notification/emailTemplate/template.hbs'), 'utf8');
const emailTemplate = Handlebars.compile(template);
export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { apiPublicKey, apiPrivateKey, receiver, from } = notificationConfig.find(
    (adapter) => adapter.id === 'mailjet'
  ).fields;
  const to = receiver
    .trim()
    .split(',')
    .map((r) => ({
      Email: r.trim(),
    }));
  return mailjet
    .apiConnect(apiPublicKey, apiPrivateKey)
    .post('send', { version: 'v3.1' })
    .request({
      Messages: [
        {
          From: {
            Email: from,
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
export const config = {
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
