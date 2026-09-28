### Discord Webhook Adapter

Use a Discord channel webhook to receive notifications.

Quick start:
- Create a webhook in your target Discord channel. See the "Intro to Webhooks" guide on the Discord support site: https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks
- Copy the generated webhook URL.
- In Fredy, configure the Discord adapter with this webhook URL.

### Price changes

This adapter also reports **price changes** when price tracking is enabled (Settings > Price tracking, off by default). A price change notification carries the old price, the new price and the percentage, and says whether the price went up or down. Changes smaller than the configured threshold are recorded in the listing's price history but are not sent, so rounding noise does not reach you.
