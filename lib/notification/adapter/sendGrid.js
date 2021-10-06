const sgMail = require('@sendgrid/mail');
const { markdown2Html } = require('../../services/markdown');

/**
 * sends a new listing using SendGrid
 * @param serviceName e.g immowelt
 * @param newListings an array with newly found listings
 * @param notificationConfig config of this notification adapter
 * @param jobKey name of the current job that is being executed
 * @returns {Promise<Chat.PostMessage.Response> | void}
 */
exports.send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { apiKey, receiver, from, templateId } = notificationConfig.find((adapter) => adapter.id === 'sendGrid').fields;
  sgMail.setApiKey(apiKey);
  const msg = {
    templateId,
    to: receiver
      .trim()
      .split(',')
      .map((r) => r.trim()),
    from,
    subject: `Job ${jobKey} | Service ${serviceName} found ${newListings.length} new listing(s)`,
    dynamic_template_data: {
      serviceName: `Job: (${jobKey}) | Service: ${serviceName}`,
      numberOfListings: newListings.length,
      listings: newListings,
    },
  };
  return sgMail.send(msg);
};

exports.config = {
  id: __filename.slice(__dirname.length + 1, -3),
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
