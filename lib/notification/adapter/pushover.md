### Pushover Adapter

Use Pushover to receive push notifications on your devices.

Setup:
- Follow Pushover's getting-started guide: https://support.pushover.net/i7-what-is-pushover-and-how-do-i-use-it
- Create an application and obtain your User Key and API Token.
- In Fredy, configure the Pushover adapter with both values.

### Price changes

This adapter also reports **price changes** when price tracking is enabled (Settings > Price tracking, off by default). A price change notification carries the old price, the new price and the percentage, and says whether the price went up or down. Changes smaller than the configured threshold are recorded in the listing's price history but are not sent, so rounding noise does not reach you.
