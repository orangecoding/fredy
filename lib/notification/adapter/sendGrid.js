const sgMail = require('@sendgrid/mail');

/**
 * sends a new listing using SendGrid
 * @param serviceName e.g immoscout
 * @param newListings an array with newly found listings
 * @param notificationConfig config of this notification adapter
 * @returns {Promise<Chat.PostMessage.Response> | void}
 */
exports.send = (serviceName, newListings, notificationConfig) => {
  const { apiKey, enabled, receiver, from, templateId } = notificationConfig.sendGrid;
  if (!enabled) {
    return [Promise.resolve()];
  }
  sgMail.setApiKey(apiKey);
  const msg = {
    templateId,
    to: receiver,
    from,
    subject: `Service ${serviceName} found ${newListings.length} new listing(s)`,
    dynamic_template_data: {
      serviceName,
      numberOfListings: newListings.length,
      listings: newListings,
    },
  };
  return sgMail.send(msg);
};
