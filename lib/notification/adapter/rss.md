### RSS feed

Keeps new listings in an RSS feed instead of pushing them somewhere. Subscribe to it in any feed reader.

Quick start:
- Create a channel of this type and save it. Fredy creates the feed url when you save.
- Open the channel again and press **Copy feed url**, then add that url to your feed reader.
- Add the channel to the jobs whose listings should go into the feed.

Good to know:
- One feed per job: create one RSS channel per job. A channel used by several jobs becomes one combined feed, every entry starts with the job's name.
- The feed fills up from the next job run on. Listings found before the channel existed are not in it.
- The feed keeps the latest 100 entries.
- The url is the only key to the feed, readers cannot sign in. Anyone who has it can read the feed. **New feed url** plus saving replaces it, the old url stops working.
- If Fredy sits behind a sign-in proxy (Authelia, Authentik, oauth2-proxy and the like), let `/api/feed/` through without sign-in, otherwise your reader only gets the login page.
- **Try** puts a test entry into the feed of a saved channel.

### Price changes

This adapter also reports **price changes** when price tracking is enabled (Settings > Price tracking, off by default). A price change becomes its own entry in the feed, with the old price, the new price and the percentage. Changes smaller than the configured threshold are recorded in the listing's price history but are not added.
