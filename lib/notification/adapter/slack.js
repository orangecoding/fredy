const Slack = require('slack');
const msg = Slack.chat.postMessage;

/**
 * sends a new listing to slack
 * @param serviceName e.g immoscout
 * @param newListings an array with newly found listings
 * @param notificationConfig config of this notification adapter
 * @returns {Promise<Chat.PostMessage.Response> | void}
 */
exports.send = (serviceName, newListings, notificationConfig) => {
  const { token, channel, enabled } = notificationConfig.slack;
  if (!enabled) {
    return [Promise.resolve()];
  }
  return newListings.map(payload =>
    msg({
      token,
      channel,
      text: `*(${serviceName})* - ${payload.title}`,
      attachments: [
        {
          fallback: payload.title,
          color: '#36a64f',
          title: 'Link to Exposé',
          title_link: payload.link,
          fields: [
            {
              title: 'Price',
              value: payload.price,
              short: false
            },
            {
              title: 'Size',
              value: payload.size,
              short: false
            },
            {
              title: 'Address',
              value: payload.address,
              short: false
            }
          ],
          footer: 'Powered by Fredy',
          ts: new Date().getTime() / 1000
        }
      ]
    })
  );
};
