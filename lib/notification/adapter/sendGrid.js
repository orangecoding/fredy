import sgMail from '@sendgrid/mail';
import { markdown2Html } from '../../services/markdown.js';
import { normalizeImageUrl } from '../../utils.js';

const mapListings = (serviceName, jobKey, listings) =>
  listings.map((l) => {
    const image = normalizeImageUrl(l.image);
    return {
      title: l.title || '',
      link: l.link || '',
      address: l.address || '',
      size: l.size || '',
      price: l.price || '',
      image,
      hasImage: Boolean(image),
      // optional plain text snippet
      snippet: [l.address, l.price, l.size].filter(Boolean).join(' | '),
      serviceName,
      jobKey,
    };
  });

export const send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { apiKey, receiver, from, templateId } = notificationConfig.find((adapter) => adapter.id === config.id).fields;

  sgMail.setApiKey(apiKey);

  const to = receiver
    .trim()
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const listings = mapListings(serviceName, jobKey, newListings);

  const msg = {
    templateId,
    to,
    from,
    subject: `Job ${jobKey} | Service ${serviceName} found ${newListings.length} new listing(s)`,
    dynamic_template_data: {
      serviceName: `Job: (${jobKey}) | Service: ${serviceName}`,
      numberOfListings: newListings.length,
      listings,
    },
  };

  return sgMail.send(msg);
};

export const config = {
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
