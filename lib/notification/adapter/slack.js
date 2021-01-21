const Slack = require('slack');
const msg = Slack.chat.postMessage;
const { markdown2Html } = require('../../services/markdown');

/**
 * sends a new listing to slack
 * @param serviceName e.g immowelt
 * @param newListings an array with newly found listings
 * @param notificationConfig config of this notification adapter
 * * @param jobKey name of the current job that is being executed
 * @returns {Promise<Chat.PostMessage.Response> | void}
 */
exports.send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
  const { token, channel } = notificationConfig.find((adapter) => adapter.id === 'slack').fields;
  return newListings.map((payload) =>
    msg({
      token,
      channel,
      text: `*(${serviceName} - ${jobKey})* - ${payload.title}`,
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
              short: false,
            },
            {
              title: 'Size',
              value: payload.size,
              short: false,
            },
            {
              title: 'Address',
              value: payload.address,
              short: false,
            },
          ],
          footer: 'Powered by Fredy',
          ts: new Date().getTime() / 1000,
        },
      ],
    })
  );
};

exports.config = {
  id: __filename.slice(__dirname.length + 1, -3),
  name: 'Slack',
  readme: markdown2Html('lib/notification/adapter/slack.md'),
  description: 'Fredy will send new listings to the slack channel of your choice..',
  fields: {
    token: {
      type: 'text',
      label: 'Token',
      description: 'The token needed to send notifications to slack.',
    },
    channel: {
      type: 'channel',
      label: 'Channel',
      description: 'The channel where fredy should send notifications to.',
    },
  },
};
