### Mattermost Adapter

Receive notifications in Mattermost via an incoming webhook.

Quick start:
- Create an incoming webhook following the Mattermost developer docs: https://docs.mattermost.com/developer/webhooks-incoming.html
- Copy the webhook URL.
- In Fredy, configure the Mattermost adapter with this URL and the target channel.

### Price changes

This adapter also reports **price changes** when price tracking is enabled (Settings > Price tracking, off by default). A price change notification carries the old price, the new price and the percentage, and says whether the price went up or down. Changes smaller than the configured threshold are recorded in the listing's price history but are not sent, so rounding noise does not reach you.
