### ntfy Adapter

Send push notifications using an ntfy topic.

Quick start:
- Create or choose a topic on your preferred ntfy instance (see docs: https://docs.ntfy.sh/publish/).
- Copy the publish URL for that topic.
- In Fredy, configure the ntfy adapter with the topic URL and set a priority.

Authentication (optional):
- If your ntfy server requires authentication (e.g. you get a `403` when sending), provide credentials.
- Preferred: set an **Access Token** (ntfy token, usually starting with `tk_`). Fredy sends it as `Authorization: Bearer <token>`.
- Alternatively: set **Username** and **Password** for HTTP Basic auth.
- The access token takes precedence over username/password when both are set.
- See the ntfy docs: https://docs.ntfy.sh/publish/#authentication

### Price changes

This adapter also reports **price changes** when price tracking is enabled (Settings > Price tracking, off by default). A price change notification carries the old price, the new price and the percentage, and says whether the price went up or down. Changes smaller than the configured threshold are recorded in the listing's price history but are not sent, so rounding noise does not reach you.
