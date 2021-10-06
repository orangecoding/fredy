const mailjet = require('node-mailjet');

const path = require('path');
const fs = require('fs');
const template = fs.readFileSync(path.resolve(__dirname, '../', 'emailTemplate/template.hbs'), 'utf8');

const Handlebars = require('handlebars');
const emailTemplate = Handlebars.compile(template);
const { markdown2Html } = require('../../services/markdown');

/**
 * sends a new listing using MailJet
 * @param serviceName e.g immowelt
 * @param newListings an array with newly found listings
 * @param notificationConfig config of this notification adapter
 * * @param jobKey name of the current job that is being executed
 * @returns {Promise<Chat.PostMessage.Response> | void}
 */
exports.send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { apiPublicKey, apiPrivateKey, receiver, from } = notificationConfig.find(
    (adapter) => adapter.id === 'mailJet'
  ).fields;

  const to = receiver
    .trim()
    .split(',')
    .map((r) => ({
      Email: r.trim(),
    }));

  return mailjet
    .connect(apiPublicKey, apiPrivateKey)
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

exports.config = {
  id: __filename.slice(__dirname.length + 1, -3),
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
