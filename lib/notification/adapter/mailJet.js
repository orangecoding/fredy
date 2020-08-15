const mailjet = require('node-mailjet');

const path = require('path');
const fs = require('fs');
const template = fs.readFileSync(path.resolve(__dirname, '../', 'emailTemplate/template.hbs'), 'utf8');

const Handlebars = require('handlebars');
const emailTemplate = Handlebars.compile(template);

/**
 * sends a new listing using MailJet
 * @param serviceName e.g immoscout
 * @param newListings an array with newly found listings
 * @param notificationConfig config of this notification adapter
 * * @param jobKey name of the current job that is being executed
 * @returns {Promise<Chat.PostMessage.Response> | void}
 */
exports.send = (serviceName, newListings, notificationConfig, jobKey) => {
  const { apiPublicKey, apiPrivateKey, enabled, receiver, from } = notificationConfig.mailJet;

  if (!enabled) {
    return [Promise.resolve()];
  }

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
          To: [
            {
              Email: receiver,
            },
          ],
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
