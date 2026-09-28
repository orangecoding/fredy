### Slack Adapter (Webhooks)

*IMPORTANT:*
This is the recommended Slack adapter. The old Slack adapter is unmaintained and kept only for backward compatibility.

Setup:
- Create a Slack account and workspace if you don't have one: https://slack.com
- Create a channel where you want to receive notifications.
- Add the Incoming Webhooks integration to that channel and copy the Webhook URL.
- In Fredy, configure the Slack Webhook adapter with this URL.

### Price changes

This adapter also reports **price changes** when price tracking is enabled (Settings > Price tracking, off by default). A price change notification carries the old price, the new price and the percentage, and says whether the price went up or down. Changes smaller than the configured threshold are recorded in the listing's price history but are not sent, so rounding noise does not reach you.
