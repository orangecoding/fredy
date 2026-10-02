### Gotify Adapter

Send push notifications to your self-hosted [Gotify](https://gotify.net/) server.

Quick start:
- In the Gotify web UI, open **Apps** and click **Create application** (e.g. name it "Fredy").
- Copy the application's **token**.
- In Fredy, configure the Gotify adapter with your server URL (e.g. `https://gotify.example.com`) and the app token.

Priority (optional):
- Each message is sent with the priority you configure. When left empty, Fredy uses `5`.
- The Gotify Android app maps priorities as follows: `0` shows no notification, `1-3` is silent, `4-7` plays a sound, `8-10` also vibrates.

Each notification shows the address, size, price (and commute time, when configured) with links to the listing and to Fredy. On Android, tapping the notification opens the listing, and the listing's photo is shown in the expanded notification.

### Price changes

This adapter also reports **price changes** when price tracking is enabled (Settings > Price tracking, off by default). A price change notification carries the old price, the new price and the percentage, and says whether the price went up or down. Changes smaller than the configured threshold are recorded in the listing's price history but are not sent, so rounding noise does not reach you.
