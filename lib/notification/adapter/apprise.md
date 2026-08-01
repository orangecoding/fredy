### Apprise Adapter

Use [Apprise](https://github.com/caronc/apprise-api#installation) to forward notifications to many different services.

Quick start:
- Set up an Apprise API instance (see the installation guide linked above).
- Configure your preferred notification service(s) within Apprise.
- In Fredy, point the Apprise adapter to your Apprise API endpoint.

### Price changes

This adapter also reports **price changes** when price tracking is enabled (Settings > Price tracking, off by default). A price change notification carries the old price, the new price and the percentage, and says whether the price went up or down. Changes smaller than the configured threshold are recorded in the listing's price history but are not sent, so rounding noise does not reach you.
