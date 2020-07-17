const sgMail = require('@sendgrid/mail');

/**
 * sends a new listing using SendGrid
 * @param serviceName e.g immoscout
 * @param newListings an array with newly found listings
 * @param notificationConfig config of this notification adapter
 * * @param jobKey name of the current job that is being executed
 * @returns {Promise<Chat.PostMessage.Response> | void}
 */
exports.send = (serviceName, newListings, notificationConfig, jobKey) => {
  const { apiKey, enabled, receiver, from, templateId } = notificationConfig.sendGrid;
  if (!enabled) {
    return [Promise.resolve()];
  }
  sgMail.setApiKey(apiKey);
  const msg = {
    templateId,
    to: receiver,
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
