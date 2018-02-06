const Slack = require('slack');
const config = require('../../../conf/config.json');
const msg = Slack.chat.postMessage;

const {token, channel} = config.notification.slack;

/**
 * sends a new listing to slack
 * @param serviceName e.g immoscout
 * @param newListings an array with newly found listings
 * @returns {Promise<Chat.PostMessage.Response> | void}
 */
exports.send = (serviceName, newListings) => {
    return newListings.map(payload => msg({
            token,
            channel,
            text: `*(${serviceName})* - ${payload.title}`,
            "attachments": [
                {
                    "fallback": payload.title,
                    "color": "#36a64f",
                    "title": "Link to Exposé",
                    "title_link": payload.link,
                    "fields": [
                        {
                            "title": "Price",
                            "value": payload.price,
                            "short": false
                        },
                        {
                            "title": "Size",
                            "value": payload.size,
                            "short": false
                        },
                        {
                            "title": "Address",
                            "value": payload.address,
                            "short": false
                        }
                    ],
                    "footer": "Powered by Fredy",
                    ts: new Date().getTime() / 1000
                }
            ]
        })
    );
};

/**
 * each integration needs to implement this method
 */
exports.enabled = () => {
    return config.notification.slack.enabled;
};
